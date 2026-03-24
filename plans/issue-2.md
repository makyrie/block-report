---
title: "feat: Show individual 311 reports on the map at block level"
type: feat
status: completed
date: 2026-03-18
---

# feat: Show individual 311 reports on the map at block level

## Overview

When a user clicks the map to explore block-level data, individual 311 service requests should appear as color-coded markers within the selected radius. Currently, the `/api/block` endpoint returns only aggregate metrics (totals, resolution rate, top issues). This feature extends it to also return the underlying individual reports and renders them as clustered, interactive markers on the Leaflet map.

## Problem Statement / Motivation

At the neighborhood level, aggregate metrics make sense — thousands of dots would overwhelm the map. But at the block level (0.25mi radius), there are typically 20–100 reports, and seeing them individually is both manageable and meaningful. "There's an open pothole report two blocks from my house" is more compelling than "your neighborhood has 847 pothole reports."

## Proposed Solution

1. **Extend the `/api/block` endpoint** to return individual reports alongside existing aggregates
2. **Add a `Block311Report` interface** for individual report data
3. **Install `leaflet.markercluster`** for performant marker rendering with clustering
4. **Render color-coded markers** on the map (red for open, green for resolved, gray for referred)
5. **Add click popups** showing report details (issue type, date, status, address)
6. **Show a count indicator** when results are capped ("Showing 500 most recent of 1,247 reports")

## Technical Considerations

### Architecture

The data flow is straightforward — it extends an existing endpoint and adds a new layer to the existing map component:

```
User clicks map → neighborhood-page fetches /api/block → response now includes `reports[]`
  → SanDiegoMap receives reports as prop → renders MarkerClusterGroup with colored CircleMarkers
  → User clicks marker → popup shows report details
```

### Performance

- **Backend:** The Prisma query in `block.ts` already fetches all rows in the radius with `service_name`, `status`, `date_requested`, `date_closed`, `lat`, `lng`. We just need to also select `street_address`, `service_request_id`, and `service_name_detail`, then return the filtered rows (capped at 500) alongside the aggregates.
- **Frontend:** `leaflet.markercluster` handles DOM performance for up to 500 markers efficiently. Using `CircleMarker` (canvas-rendered) within clusters further reduces overhead.
- **Database:** No lat/lng index exists on `requests_311`. For the current bounding-box query at block scale (small radius), this is acceptable — the query is already fast. A composite index on `(lat, lng)` could be added later if performance degrades at larger radii.

### Security

No new security concerns — the endpoint already validates coordinates and radius bounds. Individual report data (service type, status, dates, street address) is public information from San Diego's Get It Done portal.

## Implementation Phases

### Phase 1: Backend — Extend `/api/block` response

**Files:** `server/routes/block.ts`, `src/types/index.ts`

1. Add `Block311Report` interface to `src/types/index.ts`:

```typescript
// src/types/index.ts
export interface Block311Report {
  id: string;
  lat: number;
  lng: number;
  category: string;
  categoryDetail: string | null;
  status: string;
  dateRequested: string;
  dateClosed: string | null;
  address: string | null;
}
```

2. Extend `BlockMetrics` to include reports:

```typescript
// src/types/index.ts — add to existing BlockMetrics
export interface BlockMetrics {
  // ... existing fields ...
  reports: Block311Report[];
  totalReportsAvailable: number; // actual count before cap
}
```

3. Update `server/routes/block.ts`:
   - Add `service_request_id`, `street_address`, `service_name_detail` to the Prisma `select`
   - Sort `nearby` by `date_requested` descending
   - Cap at 500 reports
   - Map to `Block311Report` objects
   - Include `reports` and `totalReportsAvailable` in the response

### Phase 2: Frontend — API client and types

**Files:** `src/api/client.ts`

- `getBlockData()` already returns `BlockMetrics` — no change needed since the type is extended. The response will automatically include the new `reports` array.

### Phase 3: Frontend — Map markers with clustering

**Files:** `src/components/map/san-diego-map.tsx`, `package.json`

1. Install dependencies:
   ```bash
   npm install leaflet.markercluster
   npm install -D @types/leaflet.markercluster
   ```

2. Import MarkerClusterGroup and its CSS in `san-diego-map.tsx`

3. Create a `ReportMarkers` child component that:
   - Takes `reports: Block311Report[]` as prop
   - Creates a `MarkerClusterGroup` with custom cluster icon styling
   - Renders `CircleMarker` for each report with color based on status:
     - **Open** (status !== 'Closed', no `dateClosed`): `#ef4444` (red)
     - **Resolved** (status === 'Closed' or has `dateClosed`): `#22c55e` (green)
     - **Referred/Other**: `#9ca3af` (gray)
   - Each marker has a `Popup` showing:
     - Issue type (category + detail if available)
     - Date reported (formatted)
     - Status badge (color-coded)
     - Date resolved (if applicable)
     - Street address (if available)

4. Add `reports` and `totalReportsAvailable` to `SanDiegoMapProps`

5. Only render `ReportMarkers` when `pinnedLocation` is set and `reports` exist

6. Update the legend to include 311 report marker colors

### Phase 4: Frontend — Count indicator and integration

**Files:** `src/pages/neighborhood-page.tsx`, `src/components/map/san-diego-map.tsx`

1. Pass `blockData?.reports` and `blockData?.totalReportsAvailable` to `SanDiegoMap`

2. Show a count badge on the map when results are capped:
   - Position: near the block radius controls (top-right)
   - Text: "Showing 500 of 1,247 reports" (only when `totalReportsAvailable > reports.length`)

3. Update the `BlockPopupContent` to mention individual markers are visible:
   - Add a small note: "Click markers to see individual reports"

## Edge Cases & Design Decisions

These were identified via SpecFlow analysis and have default resolutions:

### Cap strategy
The 500-report cap applies **after** Haversine filtering. The backend fetches all bounding-box records, applies Haversine distance, sorts by `date_requested` desc, then takes 500. This is correct but means the Prisma query remains unbounded. Acceptable at block scale; a lat/lng index mitigates if needed.

### Status color mapping
The `status` field is free-text. Use this logic:
- `status === 'Closed'` or `date_closed` is set → **green** (resolved)
- `status` contains "Referred" (case-insensitive) → **gray** (referred)
- Everything else (including null) → **red** (open)

### Cluster icon styling
Use neutral-colored clusters (dark gray with white count text) to avoid confusion with the red/green/gray status colors of individual markers.

### react-leaflet v5 compatibility
Use vanilla `L.markerClusterGroup()` via the `useMap()` hook rather than a third-party react-leaflet wrapper. This avoids version compatibility issues entirely.

### Event propagation
Report marker clicks must call `e.originalEvent.stopPropagation()` (or use Leaflet's `bubblingMouseEvents: false`) to prevent triggering `MapClickHandler` and causing a re-pin.

### State on re-pin
When the user clicks a new location, old report markers are immediately cleared (blockData is set to null). The brief empty state during loading is preferable to showing stale markers at the wrong location.

### React keys
Include `service_request_id` in `Block311Report` (as `id`) for stable, unique React keys on markers.

### Popup content
Include `street_address` when available for context. Omit `public_description` to keep popups compact. Use `month: 'short', day: 'numeric'` date format matching existing `recentlyResolved` display.

### Empty state
When zero reports exist in the radius, no markers render and no "Showing X of Y" message appears. The aggregate popup already handles zero-data messaging.

### Print behavior
The map is already `print:hidden`, so report markers and cluster CSS won't leak into print layout.

## System-Wide Impact

- **Interaction graph:** User clicks map → `handleMapClick` → `getBlockData()` → response now larger (includes reports array) → `SanDiegoMap` re-renders with new marker layer. No new callbacks or side effects beyond existing flow.
- **Error propagation:** If the endpoint fails, existing error handling in `handleMapClick` catches it. No report markers render — graceful degradation to current behavior.
- **State lifecycle risks:** None — reports are part of `blockData` state, which is replaced atomically on each map click. No orphaned state possible.
- **API surface parity:** Only `/api/block` changes. The community-level `/api/311` endpoint is unaffected.

## Acceptance Criteria

- [x] `/api/block` returns `reports[]` array alongside existing aggregate fields
- [x] Reports are capped at 500, sorted by most recent `date_requested`
- [x] Response includes `totalReportsAvailable` count (pre-cap)
- [x] Individual 311 reports visible as map markers when block location is pinned
- [x] Markers are color-coded: red (open), green (resolved), gray (referred/other)
- [x] Clicking a marker shows popup with: issue type, date reported, status, date resolved, address
- [ ] Markers cluster when zoomed out or in dense areas (via `leaflet.markercluster`)
- [x] "Showing X of Y reports" indicator appears when results are capped
- [x] Performance remains smooth with up to 500 markers
- [x] Markers clear when user clicks a new location (new block query replaces old data)
- [x] Legend updated to show 311 report status colors

## Success Metrics

- Block-level exploration shows individual reports without performance degradation
- Users can identify specific issues near their location
- Clustered view provides density information at a glance

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| `leaflet.markercluster` npm package | Compatibility with react-leaflet v5 | Use the vanilla Leaflet API via `useMap()` hook rather than a react-leaflet wrapper; markercluster works directly with L.map |
| No lat/lng DB index | Slow queries at larger radii | Current bounding-box approach is fast at block scale; add index if needed |
| Response size increase | Larger payloads (~500 reports × ~200 bytes each ≈ 100KB) | Acceptable for block-level use; already gzipped by Express |

## Sources & References

### Internal References

- Block endpoint: `server/routes/block.ts:23-122`
- Map component: `src/components/map/san-diego-map.tsx:293-446`
- Types: `src/types/index.ts:59-68` (BlockMetrics)
- API client: `src/api/client.ts:57-59` (getBlockData)
- Page orchestration: `src/pages/neighborhood-page.tsx:202-214` (handleMapClick)
- Prisma schema: `prisma/schema.prisma:62-83` (Request311 model)

### Related Work

- GitHub Issue: makyrie/block-report#2
- Upstream Issue: bookchiq/block-report#25
