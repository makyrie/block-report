---
title: "Map Layer Filter — Feature Implementation & Cross-Cutting Review Patterns"
date: "2026-03-23"
category: "integration-issues"
related_issues:
  - "#13"
tags:
  - react
  - leaflet
  - react-leaflet
  - accessibility
  - aria
  - react-memo
  - useCallback
  - xss
  - stale-closures
  - abort-controller
  - performance
  - geojson
  - prisma-migrations
  - timing-safe
problem_type: feature-with-review-defects
component: src/components/map/san-diego-map.tsx
---

# Map Layer Filter — Feature Implementation & Cross-Cutting Review Patterns

## What Was Built

A **segmented button group** ("All / Libraries / Rec Centers") added to the Leaflet map that controls which resource marker types are visible. Transit stops and the pinned block marker are unaffected by the filter.

### Key Implementation

- `MarkerFilter` union type (`'all' | 'library' | 'rec_center'`) with `useState` hook
- `FILTER_OPTIONS` and `FILTER_ANNOUNCE` constants extracted at module scope (avoids inline object creation)
- `role="radiogroup"` container with `role="radio"` buttons, `aria-checked`, and `aria-live="polite"` announcements
- `print:hidden` to suppress in flyer/print views
- Conditional rendering: `(activeFilter === 'all' || activeFilter === 'library') && libraries.map(...)`

**Feature commit:** `6f3b27d`
**Single file changed:** `src/components/map/san-diego-map.tsx`

---

## Major Issues Found & Root Causes

The feature itself was structurally sound, but the code review exposed 23+ issues across the full stack — security, performance, logic, code quality, and serverless integration.

### 1. XSS via Unvalidated anchor.website URLs (P1)

**Symptom**: `anchor.website` rendered directly as `href` with no protocol validation.

**Root cause**: A `javascript:` URL in SODA data would execute code on click.

**Fix** (commits `3f9800c`, `78b97c6`):
```typescript
// src/utils/url.ts — single shared source
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://placeholder.invalid');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Usage — guard before rendering
{anchor.website && isSafeUrl(anchor.website) && <a href={anchor.website}>Website</a>}
```

### 2. generatingRef Deadlock — Mutex Never Released (P1)

**Symptom**: After switching communities while a report was in-flight, the next community's report never generated.

**Root cause**: `generatingRef.current = true` was set as a mutex but the useEffect cleanup only set `cancelled = true`, never reset the ref. Subsequent effect runs saw the lock held and skipped generation permanently.

**Fix** (commit `15bf062`):
```typescript
// BEFORE — lock acquired, never released on cleanup
return () => { cancelled = true; };

// AFTER — lock released so next community can generate
return () => {
  cancelled = true;
  generatingRef.current = false;
};
```

### 3. Stale State After AbortController Race (P1)

**Symptom**: Switching communities quickly could show the previous community's transit score or access gap data.

**Root cause**: AbortController cancelled the fetch, but `.then()` callbacks didn't check `signal.aborted`. A fetch resolving just before abort would still call the state setter with stale data.

**Fix** (commit `15bf062`):
```typescript
// BEFORE
getTransitScore(selectedCommunity, signal).then(setTransitScore);

// AFTER — guard against stale resolution
getTransitScore(selectedCommunity, signal)
  .then((data) => { if (!signal.aborted) setTransitScore(data); });
```

### 4. Polygon Holes Ignored in Point-in-Feature (P1)

**Symptom**: Points inside water features or park holes were incorrectly reported as inside the community.

**Root cause**: `pointInFeature` only tested the outer ring, ignoring hole rings in the GeoJSON coordinates array.

**Fix** (commit `3f9800c`):
```typescript
if (geometry.type === 'Polygon') {
  const [outer, ...holes] = geometry.coordinates as number[][][];
  if (!pointInPolygon(lat, lng, outer)) return false;
  for (const hole of holes) {
    if (pointInPolygon(lat, lng, hole)) return false; // Inside hole = outside polygon
  }
  return true;
}
```

### 5. Unstable Callback Prop Defeating React.memo (P2)

**Symptom**: `SanDiegoMap` (wrapped in `memo()`) re-rendered on every parent render despite no prop changes.

**Root cause**: Parent passed `onAnchorClick` as an inline arrow wrapping `handleAnchorClick` + `setMobileView('info')`. New function reference every render → memo always sees new prop.

**Fix** (commit `0e50110`):
```typescript
// Move all side effects into the memoized callback
const handleAnchorClick = useCallback(
  (anchor: CommunityAnchor) => {
    setSelectedAnchor(anchor);
    setSelectedCommunity(anchor.community);
    setMobileView('info');        // moved here from inline wrapper
    navigate(`/neighborhood/${toSlug(anchor.community)}`);
  },
  [navigate],
);

// Pass the stable reference directly — no inline wrapper
<SanDiegoMap onAnchorClick={handleAnchorClick} ... />
```

### 6. ~5800 Individual CircleMarker Components (P2)

**Symptom**: Severe initial render lag and expensive re-renders when toggling filters or switching communities.

**Root cause**: Transit stops rendered as 5800 individual `<CircleMarker>` React components → 5800 DOM elements, 5800 Leaflet layers.

**Fix** (commit `fd191fa`): Convert to a single memoized GeoJSON layer:
```typescript
const transitGeoJSON = useMemo<FeatureCollection>(() => ({
  type: 'FeatureCollection',
  features: transitStops.map((stop) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [stop.lng, stop.lat] },
    properties: { name: stop.name },
  })),
}), [transitStops]);

const transitPointToLayer = useCallback((_feature: Feature, latlng: L.LatLng) => {
  return L.circleMarker(latlng, {
    radius: 4, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.8, weight: 1,
  });
}, []);

// One component instead of ~5800
<GeoJSON key="transit-stops" data={transitGeoJSON}
  pointToLayer={transitPointToLayer} onEachFeature={transitOnEachFeature} />
```

### 7. Stale Closures in Report Auto-Fetch Effect (P2)

**Symptom**: Report generation used outdated metrics values.

**Root cause**: Values intentionally omitted from useEffect deps (to avoid re-triggering generation) were read from stale closures.

**Fix** (commit `ef02317`): Mirror values into refs updated on every render:
```typescript
const reportRef = useRef(report);
reportRef.current = report;
const transitScoreRef = useRef(transitScore);
transitScoreRef.current = transitScore;

// Inside effect — reads fresh value without adding to deps
if (reportRef.current) return;
transit: transitScoreRef.current ?? defaultTransit,
```

### 8. SQL Function Not in Migrations (P2)

**Symptom**: Fresh deploy would fail when route called `get_community_metrics()` — function didn't exist.

**Root cause**: Function was applied directly to database, not tracked in Prisma migrations.

**Fix** (commit `836e0f1`): Added migration with full function DDL plus `idx_311_comm_plan_lower` and `idx_census_community_lower` functional indexes.

### 9. Timing Side-Channel in CRON_SECRET Comparison (P2)

**Symptom**: Token length leaked via short-circuit before `timingSafeEqual`.

**Root cause**: `authHeader.length === expected.length` check exited early, and unset `CRON_SECRET` produced `"Bearer undefined"`.

**Fix** (commit `3f9800c`):
```typescript
if (!cronSecret) { res.status(401).json({ error: 'Unauthorized' }); return; }
const hashA = createHmac('sha256', 'cron').update(authHeader).digest();
const hashB = createHmac('sha256', 'cron').update(`Bearer ${cronSecret}`).digest();
if (!timingSafeEqual(hashA, hashB)) { /* reject */ }
```

### 10. Code Duplication — isSafeUrl and pointInPolygon (P2)

**Symptom**: Same utility logic in multiple files, risking divergence when one copy is fixed.

**Fix**: Extracted to single shared modules — `src/utils/url.ts` (commit `78b97c6`) and `src/utils/geo.ts` (commit `ddbd35e`).

### 11. selectedFeature Not Memoized (P3)

**Symptom**: Linear scan of all boundary features on every render, including filter toggles.

**Fix** (commit `a6604aa`):
```typescript
const selectedFeature = useMemo(
  () => selectedCommunity && neighborhoodBoundaries
    ? findCommunityFeature(neighborhoodBoundaries.features, selectedCommunity)
    : null,
  [selectedCommunity, neighborhoodBoundaries],
);
```

---

## Prevention Strategies

### Security

- **Whitelist URL protocols** — only allow `http:` and `https:`. Never render user-controlled data as `href` without validation.
- **Use HMAC for secret comparison** — hash both values to fixed-length digests before `timingSafeEqual`. Never short-circuit on length.
- **Escape HTML in Leaflet popups** — when building popup strings (not JSX), manually escape `<`, `>`, `&`.
- **Guard unset secrets** — reject early if `CRON_SECRET` is undefined instead of comparing against `"Bearer undefined"`.

### Performance

- **>500 similar items → bulk rendering** — use GeoJSON canvas layer, virtual scrolling, or WebGL instead of individual React components.
- **Callbacks to memo'd children → useCallback** — never pass inline arrows to `memo()`-wrapped components.
- **Memoize expensive lookups** — `useMemo` for any computation that scans arrays/maps on every render.
- **Profile with real data volumes** — test with production-scale datasets (5800 stops), not 50.

### State Management

- **Always reset locks in cleanup** — if `useEffect` sets a mutex, the cleanup function must release it.
- **Guard .then() after AbortController** — check `signal.aborted` before calling state setters.
- **Use refs for non-triggering reads** — when a value shouldn't trigger re-runs but needs fresh reads, mirror to `useRef`.
- **Respect exhaustive-deps** — never suppress the ESLint rule without a documented reason and a ref-based alternative.

### Code Quality

- **Extract utilities on second use** — the moment a function appears in two files, move it to a shared module.
- **All SQL in migrations** — functions, indexes, and views must go through `prisma migrate`. No manual DDL.
- **Test polygon geometry completely** — always test outer ring, holes, and MultiPolygon sub-polygons.

---

## Pre-Review Checklist for Map/UI Features

- [ ] All user-controlled URLs validated before rendering as `href`
- [ ] HTML escaped in any Leaflet `bindPopup`/`bindTooltip` calls
- [ ] Callbacks to `memo()`-wrapped children use `useCallback`
- [ ] Object/array props to memoized children use `useMemo`
- [ ] Large datasets (>500 items) use bulk rendering, not individual components
- [ ] All `useEffect` dependency arrays are explicit and complete
- [ ] All locks/flags set in effects are released in cleanup
- [ ] AbortController `.then()` callbacks check `signal.aborted`
- [ ] Secret comparisons use HMAC + `timingSafeEqual` with no short-circuits
- [ ] SQL functions and indexes tracked in Prisma migrations
- [ ] Utility functions exist in exactly one shared location
- [ ] ARIA roles, labels, and live regions are correct for interactive controls
- [ ] Print-specific classes applied (`print:hidden`) for non-print UI elements
- [ ] Tested with rapid state changes (filter toggling, community switching)

---

## Cross-References

- **Related solution docs:**
  - `docs/solutions/integration-issues/citywide-comparison-review-integration-patterns.md` — XSS in Leaflet tooltips, React.memo patterns, data normalization
  - `docs/solutions/integration-issues/express-app-serverless-vercel-deployment.md` — Serverless caching, rate limiting, CORS patterns
- **Feature plan:** `plans/issue-13.md`
- **Related issues:** #1 (choropleth GeoJSON patterns), #4 (point-in-polygon, click-to-detect), #11 (ARIA accessibility patterns)
- **Key files:**
  - `src/components/map/san-diego-map.tsx` — filter implementation
  - `src/utils/url.ts` — `isSafeUrl()` shared utility
  - `src/utils/geo.ts` — `pointInPolygon()`, `pointInFeature()` shared utility
  - `src/utils/community.ts` — `escapeHtml()`, `norm()` utilities
