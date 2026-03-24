---
title: "Citywide Comparison View — Full-Stack Integration & Review Patterns"
date: "2026-03-18"
category: "integration-issues"
related_issues:
  - "#1"
---

# Citywide Comparison View — Integration & Review Patterns

## What Was Built

A **citywide comparison view** that ranks all San Diego neighborhoods by access gap score on an interactive choropleth map with an adjacent ranked list. Users can:

- See neighborhood rankings (0–100) using a 5-color red-orange ramp
- Identify underserved areas by signal: low engagement, low transit access, high non-English-speaking population
- Explore via map or list with bidirectional hover sync
- Navigate to any neighborhood's detail view
- View everything in 6 languages (en, es, vi, tl, zh, ar)

### Key Architecture

- **Ranking algorithm** (server-side): Weighted scoring — engagement 35% + transit 30% + non-English population 35%. Min-max normalization. Requires 2 of 3 signals present.
- **Choropleth** (client-side): React-Leaflet with GeoJSON, linked to ranking data via normalized community name. Style updates via `geoJsonRef.current.setStyle()` (no remount).
- **Data flow**: `GET /api/access-gap/ranking?limit=N` → frontend merges ranking + boundaries concurrently with AbortController.

---

## Major Issues Found & Root Causes

### 1. Security — XSS via Unsanitized HTML in Leaflet Tooltips

**Symptom**: Community names from GeoJSON interpolated directly into HTML strings passed to `bindTooltip()`.

**Root cause**: Leaflet's tooltip API accepts raw HTML strings. External data was trusted without escaping.

**Fix** (commit `154297d`):
```typescript
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// In choropleth tooltip:
const safeName = escapeHtml(displayName);
const tooltipContent = `<strong>${safeName}</strong><br/>Score: ${entry.accessGapScore}/100`;
```

### 2. Security — Unbounded API Parameters

**Symptom**: `limit=0`, `limit=all`, or `limit=999999` returned unbounded result sets. No DoS protection.

**Fix** (commit `c7ad543`): Cap at `MAX_RESULTS = 200`, validate numeric, positive, clamp negatives.

### 3. Performance — O(n²) Transit Score Computation

**Symptom**: For each of 50+ communities, checking 5000+ transit stops = 200,000+ point-in-polygon operations. Cold-start was visibly slow.

**Root cause**: No spatial indexing; brute-force nested loop.

**Fix** (commit `f776cfb`): Spatial grid index with ~2km cells.
```typescript
const GRID_CELL_SIZE = 0.02; // ~2km cells

function buildSpatialGrid(stops: GridStop[]): Map<string, GridStop[]> {
  const grid = new Map<string, GridStop[]>();
  for (const stop of stops) {
    const key = gridKey(stop.lat, stop.lng);
    const cell = grid.get(key) || [];
    cell.push(stop);
    grid.set(key, cell);
  }
  return grid;
}

// Per community: only check stops in overlapping grid cells
const bbox = computeBBox(feature.geometry);
const candidates = getStopsInBBox(spatialGrid, bbox);
```

### 4. Performance — Frontend Re-renders on Hover

**Symptom**: Hovering one row in the 40-item ranking list re-rendered all 40 rows.

**Root cause**: Inline callbacks and `norm()` called inside the render loop.

**Fix** (commits `3c06dcc`, `99ec5eb`): Memoize `RankingRow` with `React.memo()`, hoist `norm()` outside loop, memoize ref callbacks.

### 5. Data Integrity — Community Name Normalization Mismatch

**Symptom**: Lookups failed silently. 311 data has mixed case ("Barrio Logan" vs "BARRIO LOGAN"). Server used `toUpperCase().trim()`, frontend used `toLowerCase().replace()`.

**Fix** (commit `1c93d62`): Extract shared `communityKey()` and `validateCommunityParam()` to `server/utils/community.ts`. Single source of truth per tier.

### 6. Data Integrity — String-Split Interpolation Bug

**Symptom**: `CitywideSummary` used `split(String(total))` to interpolate numbers into translated text. Broke when `total === withGaps` or one was a substring of the other.

**Fix** (commit `3f7ce1a`): Replace with token-based `interpolateJSX(template, vars)` that splits on `{key}` placeholders and substitutes ReactNode values. Template: `"Out of {total} communities, {withGaps} have gaps"`. See `src/utils/community.ts` for implementation.

### 7. Caching — Missing Client-Side TTL & Cache-Control Headers

**Symptom**: Browser re-downloaded boundary GeoJSON on every page reload. Client-side localStorage cache never expired.

**Fix** (commits `ac20311`, `2b885ee`): Add `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` header; add TTL to client-side cache entries.

### 8. Caching — Non-Atomic Disk Writes

**Symptom**: Process crash mid-write could corrupt the cache file.

**Fix** (commit `ac20311`): Write to temp file, atomically rename to target path.

### 9. Frontend State — Stale Tooltips on Language Switch

**Symptom**: Changing language didn't refresh choropleth tooltips.

**Root cause**: `geoJsonKey` didn't include language, so GeoJSON component didn't remount.

**Fix** (commit `58f391f`): Include `lang` in key: `useMemo(() => lang + '|' + ranking.map(...).join(','), [ranking, lang])`.

### 10. Frontend State — Fetch Not Cancelled on Unmount

**Symptom**: Navigating away from CitywidePage while data was loading caused state updates on unmounted component.

**Fix** (commit `95ac1b4`): AbortController in useEffect cleanup.

### 11. Accessibility — Missing ARIA Attributes

**Symptom**: Tab bar lacked `role="tablist"`, `aria-selected`, `aria-controls`. Interactive map had `role="img"`.

**Fix** (commits `3df0a10`, `0cb940c`): Complete ARIA implementation; use semantic HTML (`<ul>`, `<li>`, `<button>`).

### 12. Testing — Core Scoring Functions Untested

**Symptom**: `computeAllScores()`, `scoreToColor()`, `norm()`, `escapeHtml()` had zero test coverage.

**Fix** (commits `5e83437`, `fe171a8`, `90695d3`, `b1379b7`): Added unit tests for scoring, integration tests for ranking endpoint, edge-case tests for utilities.

### 13. Code Quality — Duplicated Utilities

**Symptom**: `pointInPolygon`, `computeBBox`, `haversineDistance` duplicated across 4 files. Bug fixes didn't propagate.

**Fix** (commits `d758042`, `51d5e43`, `5c15b84`): Extract to `server/utils/geo.ts` and `createCachedComputation()` utility.

---

## Prevention Strategies

### Feature Development Pre-Review Checklist

#### Security
- [ ] All external data (API responses, GeoJSON) escaped before HTML interpolation (issue 1)
- [ ] Query parameters validated and clamped to bounds (issue 2)
- [ ] External API fetches have explicit size limits and timeouts (issue 2)

#### Data Integrity
- [ ] Entity names use a single shared normalization function per tier (issue 5)
- [ ] String interpolation in i18n uses token-based `{placeholder}` templates, not string split (issue 6)

#### Performance
- [ ] Geospatial operations use spatial indexing (grid, quadtree), not O(n²) full scans (issue 3)
- [ ] List items (>10 elements) use `React.memo()` to prevent full-list re-renders (issue 4)
- [ ] Helper functions in render loops are hoisted or memoized (issue 4)

#### Caching
- [ ] All cached resources (server and client) have documented TTLs (issue 7)
- [ ] Server API responses include `Cache-Control` headers (issue 7)
- [ ] Disk writes use atomic write-then-rename pattern (issue 8)

#### Frontend State
- [ ] Cache keys include all factors that affect output (language, region, filters) (issue 9)
- [ ] All async operations cancelled in `useEffect` cleanup (AbortController) (issue 10)

#### Accessibility
- [ ] Semantic HTML used (`<button>`, `<ul>/<li>`, `<nav>`) instead of `role=` hacks (issue 11)
- [ ] Interactive components have ARIA relationships (`aria-controls`, `aria-selected`) (issue 11)

#### Testing
- [ ] Core scoring/ranking functions have unit tests (issue 12)
- [ ] Utility functions have edge-case tests (empty, null, NaN, XSS, truncation) (issue 12)

#### Code Quality
- [ ] No utility function defined in more than one file (issue 13)

---

## Cross-References

- **Feature specification**: `plans/issue-1.md` (317-line spec with phases, API contract, acceptance criteria)
- **Hackathon workplan**: `docs/plans/block-report-workplan.md` (team structure, timeline context)
- **Pending todos**: 7 items remain in `todos/` directory (P2: route tests, transit complexity, normalization inconsistency, boundary size limit; P3: factor allowlist, slug tests, cache TTL)
- **GitHub Issue**: #1 — Citywide comparison view

---

## Key Takeaways

1. **Performance dominated review findings (~35% of fixes)**. Profile early; audit for O(n²) patterns in geospatial operations. Spatial grid indexing reduced brute-force point-in-polygon checks by an estimated order of magnitude (exact reduction depends on spatial distribution of data).

2. **Security was reactive, not proactive**. XSS and validation issues were caught in review, not by tooling. Add ESLint security plugin and CSP headers to catch these earlier.

3. **Data normalization across tiers is a recurring pain point**. When server and frontend both need to match entity names, define the normalization contract once and document it.

4. **Tests were added after the feature, not during**. Only 4 commits were feature work; 55 were review fixes. Writing tests alongside the feature would have caught many issues before review.

5. **React render performance requires intentional memoization**. Lists with hover state need `React.memo()`, `useCallback()`, and hoisted helpers — this isn't premature optimization, it's table stakes for interactive UIs.

6. **Cache keys must encode all dimensions**. Missing `lang` in the GeoJSON key caused stale tooltips. Any factor that changes the output must be in the key.
