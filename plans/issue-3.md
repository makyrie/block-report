---
title: "feat: Block-level brief generation — Your Block Report"
type: feat
status: completed
date: 2026-03-18
---

# feat: Block-level brief generation — "Your Block Report"

## Overview

Extend the existing block report system to produce truly hyperlocal briefs when a user clicks on the map or enters an address. Instead of anchoring reports to civic facilities (libraries/rec centers), generate address-specific briefs that reference the user's actual location, list specific nearby open 311 issues with cross streets, show distances to nearest resources, and include neighborhood-level context for comparison.

## Problem Statement

The current block report system generates briefs anchored to CommunityAnchor objects (libraries and rec centers). While this works for pre-generated reports posted at those facilities, it doesn't serve the core use case: a resident enters *their* address and gets a report about *their* block. The printed brief should feel personal — "Your Block Report: Around 300 S Euclid Ave, Encanto" — not generic.

Key gaps in the current implementation:
1. Block reports require a `CommunityAnchor` — there's no way to generate for an arbitrary address
2. The prompt doesn't include specific open issues with street addresses or cross streets
3. No distance calculations to nearby civic resources (libraries, rec centers)
4. No neighborhood-level context for comparison ("Across Encanto as a whole...")
5. The flyer layout doesn't distinguish block-level from neighborhood-level reports
6. The `BlockMetrics` type doesn't include individual open issues with address details

## Proposed Solution

### Architecture

Extend the existing system at three layers:

1. **Data layer** — Enhance `/api/block` to return nearby open issues with address details and nearby resource distances
2. **Generation layer** — New Claude prompt template for address-anchored block briefs
3. **Presentation layer** — Flyer layout updates to show address-specific headline and block-level indicators

### Data Flow

```
User clicks map (lat, lng)
  → GET /api/block?lat=X&lng=Y&radius=0.25
  ← BlockMetrics + nearbyOpenIssues[] + nearbyResources[]
  → POST /api/report/generate-block
     body: { address, lat, lng, radius, communityName, blockMetrics, language }
  ← CommunityReport (block-level variant)
  → Flyer renders with "Your Block Report: Around {address}" headline
```

## Technical Approach

### Phase 1: Enhanced Block Data (Backend)

#### 1a. Extend BlockMetrics type

**`src/types/index.ts`**

Add new fields to `BlockMetrics`:

```typescript
export interface NearbyOpenIssue {
  serviceRequestId: string;
  serviceName: string;
  serviceNameDetail?: string;
  streetAddress?: string;
  publicDescription?: string;
  dateRequested: string;
  daysOpen: number;
  distanceMiles: number;
}

export interface NearbyResource {
  name: string;
  type: 'library' | 'rec_center';
  address: string;
  distanceMiles: number;
  phone?: string;
  website?: string;
}

export interface BlockMetrics {
  totalRequests: number;
  openCount: number;
  resolvedCount: number;
  resolutionRate: number;
  avgDaysToResolve: number | null;
  topIssues: { category: string; count: number }[];
  recentlyResolved: { category: string; date: string }[];
  radiusMiles: number;
  // New fields for block-level briefs
  nearbyOpenIssues?: NearbyOpenIssue[];
  nearbyResources?: NearbyResource[];
}
```

#### 1b. Enhance `/api/block` endpoint

**`server/routes/block.ts`**

- After filtering 311 requests by radius, extract the top 5 open issues with full details (street_address, service_name_detail, public_description, date_requested, computed days_open, distance)
- Query libraries and rec centers tables, compute Haversine distance to each, return the 3 closest of each type
- The Haversine function already exists in this file — reuse it for resource distance calculations

```typescript
// Nearby open issues with details
const nearbyOpenIssues = open
  .map((r) => ({
    serviceRequestId: r.service_request_id,
    serviceName: r.service_name || 'Unknown',
    serviceNameDetail: r.service_name_detail,
    streetAddress: r.street_address,
    publicDescription: r.public_description,
    dateRequested: r.date_requested?.toISOString() || '',
    daysOpen: r.date_requested
      ? Math.floor((Date.now() - r.date_requested.getTime()) / (1000 * 60 * 60 * 24))
      : 0,
    distanceMiles: haversineDistanceMiles(lat, lng, Number(r.lat), Number(r.lng)),
  }))
  .sort((a, b) => a.distanceMiles - b.distanceMiles)
  .slice(0, 5);

// Nearby resources (libraries + rec centers)
const [libs, recs] = await Promise.all([
  prisma.library.findMany({ where: { lat: { not: null }, lng: { not: null } } }),
  prisma.recCenter.findMany({ where: { lat: { not: null }, lng: { not: null } } }),
]);

const nearbyResources = [
  ...libs.map((l) => ({
    name: l.name,
    type: 'library' as const,
    address: l.address || '',
    distanceMiles: haversineDistanceMiles(lat, lng, l.lat!, l.lng!),
    phone: l.phone || undefined,
    website: l.website || undefined,
  })),
  ...recs.map((r) => ({
    name: r.rec_bldg || r.park_name || 'Recreation Center',
    type: 'rec_center' as const,
    address: r.address || '',
    distanceMiles: haversineDistanceMiles(lat, lng, r.lat!, r.lng!),
  })),
]
  .sort((a, b) => a.distanceMiles - b.distanceMiles)
  .slice(0, 5);

// Nearest address for headline (from closest 311 record with a street_address)
const nearestAddress = nearby
  .filter((r) => r.street_address)
  .sort((a, b) =>
    haversineDistanceMiles(lat, lng, Number(a.lat), Number(a.lng)) -
    haversineDistanceMiles(lat, lng, Number(b.lat), Number(b.lng))
  )[0]?.street_address || null;

// Community name from most common comm_plan_name in results
const communityName = (() => {
  const counts: Record<string, number> = {};
  for (const r of nearby) {
    if (r.comm_plan_name) counts[r.comm_plan_name] = (counts[r.comm_plan_name] || 0) + 1;
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] || null;
})();
```

Include `nearestAddress` and `communityName` in the response JSON alongside the existing fields.

**Important:** The block endpoint currently only selects `service_name, status, date_requested, date_closed, lat, lng` from the 311 table. The select must be expanded to include `service_request_id, service_name_detail, street_address, public_description` for open issues.

### Phase 2: Block-Level Brief Generation (Backend)

#### 2a. New address-anchored generation function

**`server/services/claude.ts`**

Add a new function `generateAddressBlockReport()` that takes an address string, lat/lng, community name, enhanced BlockMetrics, and language. This is distinct from the existing `generateBlockReport()` which takes a CommunityAnchor.

Key prompt additions per the issue:
- Headline references the address: "Your Block Report: Around {address}, {communityName}"
- Include specific open issues: "There's an open pothole report at {streetAddress} (reported {daysOpen} days ago)"
- Neighborhood-level context: "Across {communityName} as a whole, the city resolved {resolutionRate}% of reports this year"
- Hyperlocal "How to Get Involved": "Mention the nearest cross street so crews can find it"
- Nearby resources with distances: "{resourceName} — {distance} miles"

```typescript
export async function generateAddressBlockReport(
  address: string,
  lat: number,
  lng: number,
  communityName: string,
  blockMetrics: BlockMetrics,
  communityMetrics: { resolutionRate: number; totalRequests: number } | null,
  language: string,
): Promise<CommunityReport> {
  // ... prompt construction with hyperlocal template
}
```

The prompt template (from the issue, adapted):

```
You are generating a block-level community brief for the area within
{radius} miles of {address} in the {communityName} neighborhood of San Diego.

This brief is hyperlocal — it should feel like a report about the user's
immediate surroundings, not a broad neighborhood summary.

In addition to the standard sections, include:
- Specific open issues nearby (with cross streets or descriptions if available)
- Distance to nearest civic resources (library, rec center)
- Neighborhood-level context for comparison ("across the wider neighborhood...")
```

#### 2b. Update report route

**`server/routes/report.ts`**

Extend `POST /api/report/generate-block` to accept address-anchored requests:

```typescript
// Accept either anchor-based or address-based block report requests
const { anchor, address, lat, lng, radius, communityName, blockMetrics, language, demographics } = req.body;

if (address && lat && lng) {
  // Address-anchored block report (new path)
  const report = await generateAddressBlockReport(
    address, lat, lng, communityName, blockMetrics, communityMetrics, language
  );
  return res.json(report);
}

if (anchor) {
  // Existing anchor-based block report (backward compatible)
  const report = await generateBlockReport(anchor, blockMetrics, language, demographics);
  return res.json(report);
}
```

### Phase 3: Frontend Integration

#### 3a. Update API client

**`src/api/client.ts`**

Add a new function to generate address-anchored block reports:

```typescript
export function generateBlockReport(
  address: string,
  lat: number,
  lng: number,
  radius: number,
  communityName: string,
  blockMetrics: BlockMetrics,
  language: string,
): Promise<CommunityReport> {
  return fetchJSON(`${BASE}/report/generate-block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, lat, lng, radius, communityName, blockMetrics, language }),
  });
}
```

#### 3b. Update neighborhood page

**`src/pages/neighborhood-page.tsx`**

- When the user clicks the map and block data loads, show a "Generate Block Report" button in the sidebar or map popup
- On click, call `generateBlockReport()` with the pinned location
- Store the block report in state and pass it to the flyer layout
- Need to determine the address — options:
  - Use reverse geocoding (adds external dependency)
  - Use the nearest 311 issue's street address as a proxy
  - Format as "Around {lat.toFixed(4)}, {lng.toFixed(4)}" (least useful)
  - **Recommended:** Use the nearest 311 issue's `street_address` field if available, falling back to coordinate description

#### 3c. Update flyer layout

**`src/components/flyer/flyer-layout.tsx`**

- Accept optional `isBlockLevel` and `blockAddress` props
- When block-level:
  - Banner shows "YOUR BLOCK REPORT" instead of "BLOCK REPORT"
  - Title shows "Around {address}, {neighborhoodName}" instead of just neighborhood name
  - Add a "Nearby Open Issues" section listing specific issues
  - Add resource distances in the "Nearest Resource" footer section

```typescript
interface FlyerLayoutProps {
  report: CommunityReport;
  neighborhoodSlug: string;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
  inline?: boolean;
  // New block-level props
  isBlockLevel?: boolean;
  blockAddress?: string;
  blockMetrics?: BlockMetrics;
}
```

## System-Wide Impact

- **Interaction graph:** Map click → fetch block data (enhanced) → user clicks "Generate Report" → POST to report/generate-block → Claude API → response rendered in flyer → printable
- **Error propagation:** If block data fetch fails, the "Generate Report" button should be disabled. If Claude API fails, show error in sidebar. No retry — user can manually retry.
- **State lifecycle risks:** Block report generation is stateless (no caching for arbitrary coordinates). Pre-generated anchor-based reports remain untouched. No migration needed.
- **API surface parity:** The existing `generateBlockReport()` function in `claude.ts` remains for anchor-based reports. The new `generateAddressBlockReport()` is additive.

## Acceptance Criteria

### Functional Requirements

- [x] `GET /api/block` returns `nearbyOpenIssues[]` with street addresses, descriptions, and days open
- [x] `GET /api/block` returns `nearbyResources[]` with name, type, address, and distance
- [x] `POST /api/report/generate-block` accepts `address`, `lat`, `lng`, `communityName` (without requiring an anchor)
- [x] Generated brief headline references the specific address, not just the neighborhood
- [x] Generated brief includes 3-5 specific nearby open issues with street addresses
- [x] Generated brief includes distance to nearest library and rec center
- [x] Generated brief includes neighborhood-level comparison context
- [x] Flyer layout shows "YOUR BLOCK REPORT" header for address-anchored reports
- [x] Flyer layout shows address in the title line
- [x] The printed version clearly distinguishes block-level from neighborhood-level reports

### Non-Functional Requirements

- [x] Block data endpoint responds within 2 seconds (already meets this for basic metrics)
- [x] Nearby resource distance calculation doesn't add significant latency (< 100ms for library/rec center queries)
- [x] Backward compatible — existing anchor-based block reports continue to work unchanged

## Edge Cases & Design Decisions

### Address Resolution (Critical)

The map click produces lat/lng but not a human-readable address. Options considered:
1. **Reverse geocoding via Nominatim** — adds external dependency, network call, possible rate limits
2. **Use nearest 311 issue's `street_address`** — already in the database, no external dependency
3. **Coordinate-only fallback** — poor UX ("Around 32.9157, -117.1435")

**Decision:** The block endpoint should return the nearest open issue's `street_address` as a `nearestAddress` field. The frontend uses this as the address for the headline. If no 311 records have a street address within the radius, fall back to community name only. This avoids any external geocoding dependency.

### Zero or Few Open Issues in Radius

At small radii (0.1 mi), many locations may have zero open 311 requests.

**Decision:** The block endpoint returns whatever is within the selected radius. The Claude prompt should gracefully handle empty or sparse data — if fewer than 3 open issues, the brief says "Few open issues reported near your block" (which is good news). Do NOT auto-expand the radius — that would misrepresent the data scope.

### Neighborhood Context Data Flow

The block report needs community-level comparison metrics. Options:
1. Frontend fetches community metrics separately, passes to generation endpoint
2. Backend determines community from nearby 311 records' `comm_plan_name`, fetches internally

**Decision:** The frontend already fetches community metrics when a community is selected. Pass the existing `metrics` state (which includes `resolutionRate`, `totalRequests311`, `avgDaysToResolve`) to the block report generation call. This avoids a new backend query and reuses data already in the frontend.

### Block Report QR Code

Current flyer QR links to `/neighborhood/{slug}`. Block reports have no URL-addressable route.

**Decision:** Omit or link QR to the community page. Adding a `/block?lat=X&lng=Y` route is a stretch goal, not part of this issue.

### Rate Limiting

Block report generation shares the `/api/report` rate limiter (10 requests per 15 minutes). Users exploring multiple blocks could exhaust this budget.

**Decision:** Acceptable for MVP. Block report generation is an explicit user action (button click), not automatic. Monitor usage and adjust limits if needed.

### Multilingual Support

Block reports should support the same language selection as neighborhood reports.

**Decision:** The language comes from the existing `reportLang` state in the frontend, same as neighborhood reports. No additional work needed.

## Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| No street address on some 311 records | Some open issues listed without location | Fall back to service_name + "nearby" |
| Address determination for map clicks | User sees coordinates instead of address | Use nearest 311 issue's street_address as proxy |
| Claude API latency for on-demand generation | User waits 5-10s for block report | Show loading state, consider streaming |
| Large number of nearby resources to compute distance | Slow response | Library/rec center counts are small (~36 libraries, ~60 rec centers in SD) — not a concern |
| Shared rate limiter for all report generation | User exploring blocks exhausts budget | Acceptable for MVP; monitor and adjust |
| `comm_plan_name` null for some 311 records | Can't determine community for context | Fall back to generating without comparison context |

## Implementation Order

1. **Types first** — Add `NearbyOpenIssue`, `NearbyResource` to `src/types/index.ts`
2. **Block endpoint** — Enhance `server/routes/block.ts` to return open issues with details and nearby resources
3. **Claude prompt** — Add `generateAddressBlockReport()` to `server/services/claude.ts`
4. **Report route** — Update `server/routes/report.ts` to handle address-based generation
5. **API client** — Add `generateBlockReport()` to `src/api/client.ts`
6. **Neighborhood page** — Wire up block report generation from map click
7. **Flyer layout** — Add block-level variant with address headline and open issues section

## Sources & References

### Internal References

- Existing block endpoint: `server/routes/block.ts:1-123`
- Existing block report generation: `server/services/claude.ts:125-221`
- Report routes: `server/routes/report.ts:200-248`
- Types: `src/types/index.ts:59-68` (BlockMetrics)
- Flyer layout: `src/components/flyer/flyer-layout.tsx:1-222`
- Neighborhood page (block interaction): `src/pages/neighborhood-page.tsx:202-224`
- API client: `src/api/client.ts:57-84`
- Database schema: `prisma/schema.prisma:62-83` (Request311 model — has street_address, public_description, service_name_detail)

### Related Work

- GitHub Issue: makyrie/block-report#3
- Upstream Issue: bookchiq/block-report#26
