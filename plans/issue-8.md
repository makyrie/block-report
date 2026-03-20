---
title: "feat: Permit Activity Overlay on Map"
type: feat
status: completed
date: 2026-03-20
---

# feat: Permit Activity Overlay on Map

## Overview

Add a permit activity layer to the Block Report map showing recent building/development permit approvals as a "good news" investment signal. Permits indicate construction, renovation, and new business activity happening in a neighborhood — tangible signs of investment that residents care about.

This feature spans all three workstreams: **data** (backend endpoint + Prisma model + seed script), **map** (Leaflet markers + legend), and **report** (Good News section enrichment).

## Problem Statement / Motivation

The Block Report currently surfaces civic data through 311 requests, transit stops, libraries, and rec centers. Missing from this picture is **investment activity** — what new construction, renovations, and development projects are happening nearby? Permit data fills this gap by showing where money is being invested in a neighborhood, which is one of the strongest positive signals for community health.

This is stretch goal #4 from the [workplan](../docs/plans/block-report-workplan.md) (line 282), linked to upstream issue bookchiq/block-report#53.

## Proposed Solution

Follow the established patterns in the codebase:

1. **Discover the permit dataset** on `seshat.datasd.org` (DSD building permits CSV)
2. **Add a `Permit` Prisma model** and migrate the database
3. **Extend the seed script** to ingest permit CSV data with date filtering (last 12 months)
4. **Add a `/api/locations/permits` backend endpoint** returning permits from PostgreSQL
5. **Add a `Permit` TypeScript interface** in `src/types/index.ts`
6. **Add a `getPermits()` client function** in `src/api/client.ts`
7. **Render permit markers on the map** as amber `CircleMarker` components with popups
8. **Enrich the Good News section** in `/api/311` metrics with permit-based insights
9. **Extend the Claude prompt** with permit summary data for report generation

## Technical Approach

### Data Source

San Diego's Development Services Department (DSD) publishes building permit data as static CSV files on `seshat.datasd.org`. The most likely dataset URL pattern:

```
https://seshat.datasd.org/dsd_permits/dsd_permits_all_pts_datasd.csv
```

**Discovery step required**: Browse `https://seshat.datasd.org/` to locate the exact CSV URL and confirm column names. Expected columns based on San Diego open data conventions:

| Expected Column | Purpose | Notes |
|----------------|---------|-------|
| `approval_id` or `permit_number` | Primary key | Unique permit identifier |
| `approval_type` or `permit_type` | Permit category | Construction, electrical, plumbing, etc. |
| `project_title` or `description` | What's being built | Human-readable description |
| `date_issued` or `approval_date` | When approved | Filter to last 12 months |
| `status` | Current state | Issued, Completed, etc. |
| `street_address` | Location | Street address |
| `lat` / `lng` | Coordinates | For map placement |
| `comm_plan_name` or similar | Community | For filtering by neighborhood |

> **If no community field exists**: Use the existing `findCommunity()` point-in-polygon helper in `scripts/seed.ts` (line 57) to assign communities during seeding, same as Census tracts.

### Phase 1: Backend (Data Workstream)

#### 1a. Prisma Model — `prisma/schema.prisma`

```prisma
model Permit {
  id              Int       @id @default(autoincrement())
  permit_number   String    @unique
  permit_type     String?
  description     String?
  date_issued     DateTime?
  status          String?
  street_address  String?
  community       String?
  lat             Float?
  lng             Float?

  @@index([community], name: "idx_permit_community")
  @@index([date_issued], name: "idx_permit_date")
  @@map("permits")
}
```

Run `npx prisma db push` (or `npx prisma migrate dev`) after adding the model.

#### 1b. Seed Script — `scripts/seed.ts`

Add a `seedPermits()` function following the `seed311()` pattern:

```typescript
async function seedPermits() {
  console.log('Seeding permits (last 12 months)...');
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

  const rows = await fetchCsv('https://seshat.datasd.org/dsd_permits/dsd_permits_all_pts_datasd.csv');

  // Filter to recent, approved/issued permits only
  const filtered = rows.filter(r => {
    const dateIssued = r.date_issued || r.approval_date || '';
    if (!dateIssued || new Date(dateIssued) < cutoffDate) return false;
    const status = (r.status || '').toLowerCase();
    // Exclude denied, withdrawn, cancelled permits
    return !['denied', 'withdrawn', 'cancelled', 'void'].includes(status);
  });

  // Map and assign communities (if no community field)
  const mapped = filtered.map(r => ({
    permit_number: r.permit_number || r.approval_id || '',
    permit_type: r.permit_type || r.approval_type || null,
    description: r.project_title || r.description || null,
    date_issued: r.date_issued ? new Date(r.date_issued) : null,
    status: r.status || null,
    street_address: r.street_address || null,
    community: r.comm_plan_name ? toTitleCase(r.comm_plan_name.trim()) : null,
    lat: parseFloat_(r.lat),
    lng: parseFloat_(r.lng),
  }));

  // Batch insert
  const batchSize = 1000;
  let inserted = 0;
  for (let i = 0; i < mapped.length; i += batchSize) {
    const batch = mapped.slice(i, i + batchSize);
    const result = await prisma.permit.createMany({ data: batch });
    inserted += result.count;
  }
  console.log(`  ✓ ${inserted} permits`);
}
```

Call `seedPermits()` in the main `seed()` function alongside existing seeders.

#### 1c. Backend Endpoint — `server/routes/locations.ts`

Add a new route to the existing locations router:

```typescript
router.get('/permits', async (req, res) => {
  try {
    const community = req.query.community as string | undefined;
    const where: Record<string, unknown> = {};

    if (community) {
      where.community = community;
    }

    // Only return permits with valid coordinates
    where.lat = { not: null };
    where.lng = { not: null };

    const data = await prisma.permit.findMany({
      where,
      select: {
        id: true,
        permit_number: true,
        permit_type: true,
        description: true,
        date_issued: true,
        status: true,
        street_address: true,
        community: true,
        lat: true,
        lng: true,
      },
      orderBy: { date_issued: 'desc' },
      take: 5000, // Cap results to prevent payload bloat
    });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch permits', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Design decisions:**
- Optional `?community=` filter parameter — load all permits on mount for map display, or filter by community for sidebar/report use
- Cap at 5,000 results to prevent massive payloads on the global load
- Only return permits with valid lat/lng (skip records missing coordinates)

### Phase 2: Frontend Types & API (Map Workstream)

#### 2a. TypeScript Interface — `src/types/index.ts`

```typescript
export interface Permit {
  id: number;
  permit_number: string;
  permit_type: string | null;
  description: string | null;
  date_issued: string | null;
  status: string | null;
  street_address: string | null;
  community: string | null;
  lat: number;
  lng: number;
}
```

#### 2b. API Client Function — `src/api/client.ts`

```typescript
export function getPermits(community?: string): Promise<Permit[]> {
  const params = community ? `?community=${encodeURIComponent(community)}` : '';
  return fetchJSON(`${BASE}/locations/permits${params}`);
}
```

### Phase 3: Map Layer (Map Workstream)

#### 3a. Map Props — `src/components/map/san-diego-map.tsx`

Add `permits` to `SanDiegoMapProps`:

```typescript
interface SanDiegoMapProps {
  // ... existing props ...
  permits: Permit[];
}
```

#### 3b. TYPE_CONFIG and Legend

Add a `permit` entry to `TYPE_CONFIG`:

```typescript
const TYPE_CONFIG: Record<'library' | 'rec_center' | 'transit' | 'permit', TypeConfig> = {
  // ... existing entries ...
  permit: { dot: 'bg-amber-500', label: 'Permit', text: 'text-amber-700' },
};
```

Add a legend entry:

```html
<li className="flex items-center gap-2">
  <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-amber-500 shrink-0" />
  <span className="text-gray-700">Permit</span>
</li>
```

#### 3c. Permit Markers

Render as `CircleMarker` (performant for large datasets, like transit stops):

```tsx
{permits.map((permit) => (
  <CircleMarker
    key={permit.id}
    center={[permit.lat, permit.lng]}
    radius={5}
    pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.8, weight: 1 }}
  >
    <Popup>
      <PermitPopupContent permit={permit} />
    </Popup>
  </CircleMarker>
))}
```

#### 3d. Popup Component

```tsx
function PermitPopupContent({ permit }: { permit: Permit }) {
  return (
    <div className="min-w-[200px] max-w-[260px]">
      <TypeBadge type="permit" />
      {permit.permit_type && (
        <p className="font-semibold text-gray-900 text-sm leading-snug mb-1">{permit.permit_type}</p>
      )}
      {permit.description && (
        <p className="text-xs text-gray-600 mb-1.5 line-clamp-3">{permit.description}</p>
      )}
      {permit.street_address && (
        <p className="text-xs text-gray-600 flex items-start gap-1 mb-1">
          <span aria-hidden="true" className="mt-px shrink-0">📍</span>
          <span>{permit.street_address}</span>
        </p>
      )}
      {permit.date_issued && (
        <p className="text-xs text-gray-500">
          Issued: {new Date(permit.date_issued).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}
      {permit.status && (
        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          {permit.status}
        </span>
      )}
    </div>
  );
}
```

#### 3e. Data Loading — `src/pages/neighborhood-page.tsx`

Add state and fetch in the mount `useEffect`:

```typescript
const [permits, setPermits] = useState<Permit[]>([]);

// In the mount useEffect:
getPermits().then(setPermits).catch(console.error);
```

Pass `permits` prop to `<SanDiegoMap>`.

### Phase 4: Good News Integration (Data + Report Workstreams)

#### 4a. Metrics Endpoint — `server/routes/metrics.ts`

After the existing good news detection (line 85), add permit-based good news:

```typescript
// 5. Recent permit activity as investment signal
try {
  const recentPermits = await prisma.permit.count({
    where: {
      community: cleaned,
      date_issued: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }, // 6 months
    },
  });
  if (recentPermits > 0) {
    goodNews.push(
      `${recentPermits} building permits were issued in the last 6 months — a sign of active investment in the neighborhood.`
    );
  }
} catch (err) {
  logger.error('Failed to fetch permit good news', { error: (err as Error).message });
  // Non-fatal — don't block the response
}
```

#### 4b. Claude Prompt Enrichment — `server/services/claude.ts`

Extend the `NeighborhoodProfile` data passed to Claude with a permit summary. Add to the profile data before sending to the Claude API:

```typescript
// In the report generation function, query permit summary
const permitCount = await prisma.permit.count({
  where: { community: profile.communityName }
});
```

Include in the system prompt: "Recent permit activity: X permits issued, indicating neighborhood investment."

## System-Wide Impact

### Interaction Graph

1. User loads neighborhood page → `getPermits()` fires → `/api/locations/permits` → `prisma.permit.findMany()` → response rendered as `CircleMarker` on map
2. User selects community → `/api/311?community=X` fires → metrics route now also queries `prisma.permit.count()` → permit count added to `goodNews[]` → displayed in sidebar
3. User generates report → `POST /api/report/generate` → Claude prompt includes permit summary from profile → Good News section mentions permits

### Error Propagation

- If the permit endpoint fails, map loads without permit markers (non-fatal, caught in `useEffect`)
- If the permit good news query fails in metrics, the response still returns with 311-based good news only (try/catch in metrics route)
- If the permit CSV URL is wrong or unavailable during seeding, `seedPermits()` throws but other seeders are unaffected

### State Lifecycle Risks

- **Stale permit data**: Permits are seeded once from CSV. If the CSV updates, re-running the seed script refreshes the data. No real-time sync.
- **Missing community assignment**: If permits lack a `comm_plan_name` field, the seed script must use geo-lookup. Permits without valid lat/lng will have `community: null` and won't appear in community-filtered queries.

### API Surface Parity

| Interface | Needs Update |
|-----------|-------------|
| `GET /api/locations/permits` | **New endpoint** |
| `GET /api/311?community=X` | Yes — adds permit good news items |
| `POST /api/report/generate` | Yes — permit data in Claude prompt |
| `SanDiegoMapProps` | Yes — new `permits` prop |
| `NeighborhoodProfile` | Potentially — if adding permit summary field |

### Integration Test Scenarios

1. **Seed → Query → Display**: Seed permits from CSV, hit `/api/locations/permits`, verify markers appear on the map at correct lat/lng positions
2. **Community filtering**: Select "Mira Mesa" → verify only Mira Mesa permits appear in sidebar good news and the `/api/locations/permits?community=Mira Mesa` response
3. **Empty community**: Select a community with zero permits → verify graceful handling (no "0 permits" message, just omit)
4. **Report generation with permits**: Generate a report for a community with permits → verify Good News section references permit activity
5. **Large dataset performance**: Load map with all permits (potentially thousands) → verify no UI freeze, markers render as `CircleMarker`

## Acceptance Criteria

### Functional Requirements

- [x] Permit data is ingested from San Diego open data portal CSV into PostgreSQL via seed script
- [x] `GET /api/locations/permits` returns permit records with optional `?community=` filter
- [x] Permit markers (amber circles) appear on the Leaflet map with popups showing permit details
- [x] Map legend includes a "Permit" entry with amber dot
- [x] Good News section in sidebar includes permit-based insights when permits exist for the selected community
- [x] Community reports generated by Claude reference permit activity in the Good News section
- [x] Only recent permits (last 12 months) are seeded; denied/withdrawn/cancelled permits are excluded

### Non-Functional Requirements

- [x] Map performance is acceptable with up to 5,000 permit markers (CircleMarker, not Marker)
- [x] Permit endpoint responds in < 500ms
- [x] Seed script handles missing/malformed permit data gracefully (null fields, missing coordinates)

### Quality Gates

- [ ] TypeScript compiles with no errors (`npx tsc --noEmit`)
- [ ] Tested with Mira Mesa as the demo community
- [x] Permit markers visually distinguishable from other map layers (amber vs blue/green/violet)

## Dependencies & Risks

### Dependencies

- **San Diego open data portal availability**: The permit CSV must be accessible on `seshat.datasd.org`. If the URL is wrong or the dataset doesn't exist in the expected format, the feature is blocked.
- **DATABASE_URL environment variable**: Must be set for Prisma to migrate and seed.
- **Shared types (`src/types/index.ts`)**: Adding the `Permit` interface touches a file all workstreams depend on — coordinate with team.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Permit CSV URL/columns don't match expectations | Medium | High (blocks feature) | Discovery step first — download and inspect CSV headers before coding |
| Permit dataset is very large (50k+ records) | Medium | Medium (performance) | Filter to 12 months at seed time, cap API response at 5k, use CircleMarker |
| No `community` field in permit CSV | Medium | Low | Use existing `findCommunity()` geo-lookup during seeding |
| Permit types include demolition/negative entries | High | Medium (UX) | Filter out non-positive permit types in seed script or query |

## Implementation Order

Suggested order to minimize risk and enable incremental testing:

1. **Discover permit CSV** — manually verify URL and column names (5 min)
2. **Prisma model + migration** — `prisma/schema.prisma` (5 min)
3. **Seed script** — `scripts/seed.ts` (15 min)
4. **Backend endpoint** — `server/routes/locations.ts` (10 min)
5. **Frontend types + API client** — `src/types/index.ts`, `src/api/client.ts` (5 min)
6. **Map markers + popup + legend** — `src/components/map/san-diego-map.tsx` (20 min)
7. **Data loading** — `src/pages/neighborhood-page.tsx` (5 min)
8. **Good News integration** — `server/routes/metrics.ts` (10 min)
9. **Claude prompt enrichment** — `server/services/claude.ts` (10 min)
10. **Test with Mira Mesa** — end-to-end verification (10 min)

## Files to Modify

| File | Change | Workstream |
|------|--------|------------|
| `prisma/schema.prisma` | Add `Permit` model | data |
| `scripts/seed.ts` | Add `seedPermits()` function | data |
| `server/routes/locations.ts` | Add `GET /permits` route | data |
| `server/routes/metrics.ts` | Add permit good news query | data |
| `server/services/claude.ts` | Add permit data to Claude prompt | report |
| `src/types/index.ts` | Add `Permit` interface | shared |
| `src/api/client.ts` | Add `getPermits()` function | map |
| `src/components/map/san-diego-map.tsx` | Add permit markers, popup, legend | map |
| `src/pages/neighborhood-page.tsx` | Add permits state + fetch | map |

## Sources & References

### Internal References

- Workplan stretch goal #4: `docs/plans/block-report-workplan.md:282`
- Existing location routes pattern: `server/routes/locations.ts:14-43`
- Seed script pattern: `scripts/seed.ts:131-189` (311 seeding with date filter + batch insert)
- Map marker pattern: `src/components/map/san-diego-map.tsx:396-408` (CircleMarker for transit)
- Good News detection: `server/routes/metrics.ts:55-85`
- Type definitions: `src/types/index.ts`

### External References

- San Diego open data portal: `https://data.sandiego.gov/datasets/`
- Static CSV files: `https://seshat.datasd.org/`
- Upstream issue: bookchiq/block-report#53
- GitHub issue: makyrie/block-report#8

### Related Work

- Existing map layers (libraries, rec centers, transit) provide the implementation template
- 311 Good News detection provides the pattern for permit-based good news
