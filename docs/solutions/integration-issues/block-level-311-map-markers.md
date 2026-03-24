---
title: "Block-Level 311 Map Markers"
date: 2026-03-18
problem_type: integration-issue
component:
  - "server/routes/block.ts"
  - "src/components/map/san-diego-map.tsx"
  - "src/components/map/popup-content.tsx"
  - "src/pages/neighborhood-page.tsx"
  - "server/utils/status.ts"
  - "server/utils/geo.ts"
  - "src/types/index.ts"
symptoms:
  - "No way to view individual 311 reports on the map — only neighborhood-level aggregates"
  - "After initial implementation: 26 review findings spanning performance, security, code quality, and testing"
  - "Case-sensitive status matching misclassified reports"
  - "Double-fetch on map click due to radius state change"
  - "Stale fetch results overwriting fresh data (race condition)"
  - "Unbounded in-memory cache growth"
  - "XSS vector via unvalidated URL protocols in popup links"
  - "No rate limiting on expensive spatial query endpoint"
severity: medium
tags:
  - block-level-311
  - leaflet
  - react-memo
  - abort-controller
  - rate-limiting
  - haversine
  - xss-prevention
related_issues:
  - 2
---

## Problem Statement

Users needed to explore individual 311 service requests (potholes, street repairs, abandoned vehicles) at the block level rather than only seeing neighborhood-level aggregates. Clicking the map should display 20–100+ individual reports as color-coded markers within a configurable radius, showing whether each request is open, resolved, or referred.

This required a new `/api/block` endpoint returning both aggregate metrics and individual reports, plus frontend rendering of status-colored CircleMarkers with popups — a full-stack integration spanning Prisma queries, Express routes, React components, and Leaflet rendering.

## Root Cause of Review Volume

The initial implementation (commit `a76350f`) was functionally correct but went through **26 review iterations** to reach production quality. The dominant pattern: utilities started inline, caches were unbounded, security and testing were deferred to "later." Each of these created compounding review debt — extracting `classifyStatus` touched 4 files, adding cache bounds required rethinking the eviction strategy, and the AbortController pattern required understanding React + network race conditions.

## Solution

### Architecture

```
Map Click → neighborhood-page.tsx (AbortController + fetch)
         → GET /api/block?lat=...&lng=...&radius=...
         → block.ts (LRU cache → Prisma query → bounding box → Haversine filter)
         → Single-pass aggregation (counts, top issues, recent reports)
         → Response: { metrics + reports[] + totalReports }
         → san-diego-map.tsx (ReportMarkers memo'd component)
         → popup-content.tsx (status colors, popup layout)
```

### Key Patterns

**1. Single-Pass Aggregation**

Iterate reports once, accumulating all metrics simultaneously:

```typescript
const statusCategoryMap = new Map<string, string>();
for (const r of nearby) {
  const statusCat = classifyStatus(r.status, r.date_closed);
  statusCategoryMap.set(r.service_request_id, statusCat);
  if (statusCat === 'resolved') resolvedCount++;
  else if (statusCat === 'referred') referredCount++;
  else openCount++;
  // Also accumulate issue counts and resolution days in same loop
}
```

**2. Two-Stage Spatial Filtering**

Bounding box for DB efficiency, then Haversine for accuracy:

```typescript
// Stage 1: Prisma WHERE with lat/lng bounds (uses index)
// Stage 2: Exact distance check
const nearby = data.filter((r) =>
  haversineDistanceMiles(lat, lng, Number(r.lat), Number(r.lng)) <= snappedRadius
);
```

**3. AbortController for Stale Fetch Cancellation**

```typescript
// In neighborhood-page.tsx
const blockAbortRef = useRef<AbortController>();
blockAbortRef.current?.abort(); // Cancel previous request
const controller = new AbortController();
blockAbortRef.current = controller;
try {
  const data = await getBlockData(lat, lng, radius, controller.signal);
  if (!controller.signal.aborted) setBlockData(data);
} catch (err) {
  if ((err as Error).name === 'AbortError') return; // Expected — not an error
  // Handle real errors...
}
```

**4. Stable References for React.memo**

```typescript
const EMPTY_REPORTS: Block311Report[] = []; // Module scope — stable identity
const ReportMarkers = React.memo(({ reports }: Props) => { ... });
// In parent: reports={blockData?.reports ?? EMPTY_REPORTS}
```

**5. Centralized Status Classification**

```typescript
// server/utils/status.ts — single source of truth
const REFERRED_RE = /referred/i;

export function classifyStatus(status: string | null, dateClosed: Date | null): 'open' | 'resolved' | 'referred' {
  if (/^closed$/i.test(status || '') || !!dateClosed) return 'resolved';
  if (REFERRED_RE.test(status || '')) return 'referred';
  return 'open';
}
```

**6. Bounded Cache with TTL + LRU Eviction**

```typescript
// 200 entries max, 5-minute TTL, keyed by rounded lat/lng + radius
const blockCache = new Map<string, { data: BlockMetrics; cachedAt: number }>();

function getCachedBlock(key: string): BlockMetrics | null {
  const entry = blockCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > BLOCK_CACHE_TTL) {
    blockCache.delete(key);
    return null;
  }
  // LRU: delete + re-set moves entry to end; Map iterates in insertion order
  blockCache.delete(key);
  blockCache.set(key, entry);
  return entry.data;
}
```

**7. Radius Snapping for Cache Efficiency**

```typescript
const ALLOWED_RADII = [0.1, 0.25, 0.5, 1, 2];
const snappedRadius = ALLOWED_RADII.reduce((prev, curr) =>
  Math.abs(curr - radius) < Math.abs(prev - radius) ? curr : prev
);
```

**8. Canvas Renderer for 500+ Markers**

```typescript
// san-diego-map.tsx — Canvas avoids creating individual DOM elements per marker
<MapContainer preferCanvas={true} ... >
```

Without this, each CircleMarker creates an SVG DOM node. With 500 markers, Canvas is dramatically faster.

**9. Report Cap + Selective Prisma Query**

```typescript
const MAX_REPORTS = 500;
const QUERY_SAFETY_CAP = 10_000;

// Fetch only needed columns, ordered so the cap preserves the most recent
const data = await prisma.request311.findMany({
  where: { lat: { gte: minLat, lte: maxLat }, lng: { gte: minLng, lte: maxLng } },
  select: { service_request_id: true, lat: true, lng: true, status: true, /* ... */ },
  orderBy: { date_requested: 'desc' },
  take: QUERY_SAFETY_CAP,
});
```

The `select` clause minimizes DB I/O. `orderBy DESC` + `MAX_REPORTS` cap ensures the most actionable (recent) reports survive truncation. `totalReports` in the response enables "Showing X of Y" UI.

**10. Two Layers of Memoization**

Both `ReportMarkers` (child) and `SanDiegoMap` (parent) are wrapped in `React.memo`. The parent memo prevents re-renders when neighborhood-page state changes (e.g., report generation) that don't affect map props.

### Review Findings by Category

| Category | Count | Key Fixes |
|----------|-------|-----------|
| Performance | 8 | Memoize ReportMarkers, eliminate double-fetch, cache `findCommunityFeature`, LRU eviction, radius snapping |
| Security | 3 | Validate URL protocols (XSS), sanitize tel: URIs, add dedicated rate limiter + trust proxy |
| Code Quality | 8 | Extract `classifyStatus` + `haversineDistanceMiles` to utils, shared `BlockMetrics` type, centralize status colors, fix `.sort()` mutation |
| Testing | 3 | Unit tests for geo + status utils, route-level tests for `/api/block` |
| Race Conditions | 2 | AbortController for stale fetches, check `!signal.aborted` before state update |
| Data Accuracy | 2 | Remove fixed `take: 5000` (silent truncation), add safety cap with logging |

## Security Architecture

Defense-in-depth layers present in this feature:

1. **Helmet middleware** (`server/app.ts`) — Sets CSP, X-Frame-Options, X-Content-Type-Options, and other security headers
2. **CORS** — Restricts cross-origin requests to allowed origins
3. **Rate limiting** — Three tiers: general API (100 req/15min), block endpoint (20 req/15min), report endpoint (10 req/15min). `trust proxy: 1` ensures limiting keys on real client IP behind a reverse proxy
4. **Input validation** — `Number()` coercion + `isNaN()` rejection + bounding-box range check at route level
5. **React auto-escaping** — JSX renders user-sourced strings (address, category, status) safely by default. Never use `dangerouslySetInnerHTML` with external data
6. **URL protocol validation** — `href` attributes checked for `https?://` before rendering; `tel:` URIs sanitized to digits/symbols only
7. **`rel="noreferrer"`** on external links — Prevents reverse tabnapping via `window.opener`
8. **Generic error responses** — Clients receive `"Internal server error"`; detailed errors logged server-side only

## Prevention Strategies

### Before Shipping Map/Data Features

1. **Extract utilities first** — If a calculation (distance, classification, formatting) appears in more than one place, extract to `server/utils/` or `src/utils/` with unit tests before integrating
2. **Define shared types before implementation** — Add interfaces to `src/types/index.ts` as the first commit; backend and frontend import the same shape
3. **Bound all caches** — Every in-memory cache needs both TTL and max-size from day one; unbounded caches are memory leaks
4. **Rate limit expensive endpoints** — Add a dedicated rate limiter before merging any endpoint that hits the database with user-controlled parameters. Set `trust proxy` if behind a reverse proxy
5. **Sanitize all URI schemes from external data** — Check `https?://` for website links. For `tel:` URIs, strip to allowed phone characters. Never construct `javascript:` or `data:` URIs from external data. Add `rel="noreferrer"` to external links
6. **Validate POST request bodies** — Use schema validation (Zod, Joi) rather than TypeScript type assertions, which provide no runtime protection
7. **Return generic error messages** — Never include stack traces, query details, or internal paths in API responses

### React + Leaflet Performance

1. **`preferCanvas={true}`** — Use Canvas renderer on MapContainer when rendering 100+ CircleMarkers; avoids individual SVG DOM nodes per marker
2. **Memo marker components** — Any component rendering 100+ markers should be `React.memo`'d with stable prop references
3. **Module-scope empty arrays** — `const EMPTY: T[] = []` at module scope prevents identity churn that defeats memo
4. **useCallback for event handlers** — Especially handlers passed to memoized children; use curried factory pattern for per-item handlers
5. **useMemo for expensive lookups** — Community boundary matching, fuzzy search, etc.
6. **bubblingMouseEvents={false}** — Prevent marker clicks from re-triggering map click handlers

### Async Data Fetching

1. **AbortController pattern** — For any fetch triggered by user interaction (clicks, typing), cancel the previous request before starting a new one
2. **Check abort before state update** — `if (!signal.aborted) setState(data)` prevents stale overwrites
3. **Separate abort errors from real errors** — `if (error.name === 'AbortError') return` in catch blocks
4. **Debounce rapid interactions** — 300ms minimum for map clicks that trigger API calls

### Testing Requirements for Similar Features

- Unit tests for all pure utility functions (status, distance, formatting)
- Route-level tests: valid input (200), missing params (400), out-of-bounds (400), DB error (500)
- Integration tests: rapid clicks cancel stale fetches, markers match data, colors match legend

## Related Files

- `plans/issue-2.md` — Original implementation plan
- `server/routes/block.ts` — Block endpoint with LRU cache and aggregation
- `src/components/map/popup-content.tsx` — Extracted popup components and status colors
- `src/components/map/san-diego-map.tsx` — ReportMarkers memoized component
- `src/pages/neighborhood-page.tsx` — AbortController fetch management
- `server/utils/status.ts` — Centralized status classification
- `server/utils/geo.ts` — Haversine distance utility

## Related Todos

- `todos/006-pending-p2-duplicated-block-fetch-logic.md` — Extract shared `fetchBlock` callback
- `todos/008-pending-p2-blockresponse-duplicates-blockmetrics.md` — Unify response type with BlockMetrics
- `todos/015-pending-p3-safety-cap-not-surfaced.md` — Add `aggregatesTruncated` flag when cap is hit
