---
title: "Choropleth layer integration: React state + Leaflet GeoJSON pitfalls"
problem_type: integration_issue
component:
  - src/components/map/san-diego-map.tsx
  - src/pages/neighborhood-page.tsx
  - src/utils/score-to-color.ts
  - src/utils/normalize.ts
  - server/routes/gap-analysis.ts
symptoms:
  - Stale choropleth colors when scores load after GeoJSON boundaries
  - XSS via unsanitized GeoJSON properties in bindTooltip
  - Double-fire toggle (checkbox + wrapper onClick)
  - Community name normalization mismatch between client and server
  - NaN scores rendered as red instead of gray
  - Race conditions causing chimera data on rapid community switching
tags:
  - choropleth
  - leaflet
  - react-state
  - normalization
  - xss
date_solved: "2026-03-20"
severity: medium
related_issues:
  - "#5 — Add choropleth/heatmap layer showing access gap scores"
related_files:
  - plans/issue-5.md
  - todos/005-pending-p2-static-geojson-key-stale-choropleth.md
  - todos/010-pending-p3-scoretocolor-nan-returns-red.md
  - todos/014-pending-p3-oneachfeature-stale-scores-closure.md
---

# Choropleth Layer Integration: React State + Leaflet GeoJSON Pitfalls

## Context

Issue #5 added a choropleth map layer visualizing access gap scores by San Diego neighborhood. The initial implementation (commit `bf602e0`) worked for the happy path but numerous fix commits followed, addressing bugs found during code review. These bugs form a pattern: integrating Leaflet's imperative GeoJSON rendering with React's declarative state model surfaces multiple classes of issues.

This document captures the pitfalls and prevention strategies so future Leaflet/React integrations avoid the same traps.

## Solution Architecture

```
neighborhood-page.tsx (state owner)
  │
  ├── useEffect: fetch all access gap scores → Map<normalizedName, score>
  ├── useEffect: fetch community data with cancelled flag
  │
  └── <SanDiegoMap> (React.memo)
        ├── <GeoJSON key={`choropleth-${scores.size}`}> — dynamic key forces remount
        │     ├── style: feature → scoreToColor(lookup(feature.properties.cpname))
        │     └── onEachFeature: bindTooltip (DOM element, not HTML), click via ref
        ├── Toggle control (top-right, offset from block-radius control)
        └── Legend (bottom-right, 5-band color scale)
```

## Bug Categories and Fixes

### 1. XSS in GeoJSON Tooltips

**Problem:** `bindTooltip()` accepted an HTML string with unsanitized `cpname` from GeoJSON properties. A malicious property value could execute script.

**Fix:** Create a DOM element with `textContent` instead of HTML string interpolation:

```typescript
// BEFORE (vulnerable)
layer.bindTooltip(`${name}: ${score}/100`, { sticky: true });

// AFTER (safe)
const el = document.createElement('span');
el.textContent = `${name}: ${score !== undefined ? score + '/100' : 'No data'}`;
layer.bindTooltip(el, { sticky: true });
```

Also validated anchor URLs (`/^https?:\/\//i`) and phone numbers (`/^[\d\s()+\-]+$/`) before rendering as `href`/`tel:` links.

**Prevention:** Never interpolate untrusted data into HTML strings. Use DOM APIs with `textContent` for Leaflet tooltips and popups.

### 2. Stale GeoJSON Key → Stale Colors

**Problem:** Static `key="choropleth"` on `<GeoJSON>` meant React-Leaflet never remounted the layer when `accessGapScores` loaded asynchronously after boundaries. Colors stayed at their initial (no-data) state.

**Fix:** Dynamic key that changes when scores arrive:

```typescript
<GeoJSON
  key={`choropleth-${accessGapScores?.size ?? 0}`}
  data={neighborhoodBoundaries}
  // score looked up from accessGapScores map via normalizeCommunityName(feature.properties.cpname)
  style={(feature) => ({ fillColor: scoreToColor(lookupScore(feature)) })}
/>
```

**Prevention:** When a React-Leaflet component's rendering depends on state not in `data`, include that state's identity in the `key` prop to force remount. Note: using `scores.size` is slightly fragile — if scores are updated in place without changing size, the key won't change. A version counter is more robust for frequently-mutated data.

### 3. Stale Closure in onEachFeature

**Problem:** `onEachFeature` captures `onCommunitySelect` at mount time. When the parent re-renders with a new callback, Leaflet's click handler still calls the stale version.

**Fix:** Use a ref to always access the latest callback:

```typescript
const onCommunitySelectRef = useRef(onCommunitySelect);
onCommunitySelectRef.current = onCommunitySelect;

// In onEachFeature:
layer.on('click', (e) => {
  L.DomEvent.stopPropagation(e);
  onCommunitySelectRef.current?.(name);
});
```

**Prevention:** For any callback passed into Leaflet's imperative API (event handlers, popups), store it in a ref that updates on every render. Never rely on closure capture for values that change.

### 4. Community Name Normalization Divergence

**Problem:** Client used `toLowerCase().replace(/[^a-z0-9]/g, ' ')` while server used `.toUpperCase().trim()`. Map lookups failed silently — scores existed but were keyed differently.

**Fix:** Extract a shared utility imported by both:

```typescript
// src/utils/normalize.ts
export function normalizeCommunityName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}
```

Updated `tsconfig.server.json` to include `src/utils` so the server can import it.

**Prevention:** When client and server both key on the same identifier, extract normalization to a shared module. Never assume they'll "just match." Test round-trip: `"MIRA MESA"`, `"Mira Mesa"`, `"mira-mesa"` must all produce the same key.

### 5. scoreToColor NaN Handling

**Problem:** `scoreToColor(NaN)` fell through all comparisons (`NaN < 20` is `false`, etc.) and returned red — misrepresenting missing data as high-risk.

**Fix:**

```typescript
export function scoreToColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '#d1d5db'; // gray for missing
  if (score < 20) return '#22c55e';  // green
  if (score < 40) return '#a3e635';  // lime
  if (score < 60) return '#facc15';  // yellow
  if (score < 80) return '#f97316';  // orange
  return '#ef4444';                   // red
}
```

**Prevention:** Always test color/category functions with `null`, `undefined`, `NaN`, `0`, negative numbers, and boundary values. Use `==` (loose equality) for null checks to cover both null and undefined.

### 6. Race Conditions in Async Effects

**Problem:** Rapid community switching caused "chimera data" — metrics from community A mixed with demographics from community B because fetch responses arrived out of order.

**Fix:** Add `cancelled` flag in effect cleanup:

```typescript
useEffect(() => {
  let cancelled = false;
  get311(selectedCommunity)
    .then((data) => { if (!cancelled) setMetrics(data); })
    .catch(console.error);
  return () => { cancelled = true; };
}, [selectedCommunity]);
```

**Prevention:** Any async operation that calls `setState` must guard against staleness — whether in a `useEffect` or a callback. For effects, use a `cancelled` flag in cleanup. For callbacks (e.g., map click handlers), use an `AbortController` or a component-mounted ref. This is not optional — it prevents stale responses from overwriting current state.

### 7. Non-Null Assertions Hiding Errors

**Problem:** `buildProfile()` used `selectedCommunity!` and `metrics!` — non-null assertions that compiled but crashed or produced garbage at runtime when state was still loading.

**Fix:** Accept the most critical values as explicit parameters rather than asserting them from closure:

```typescript
const buildProfile = useCallback(
  (community: string, m: NeighborhoodProfile['metrics']): NeighborhoodProfile => ({
    communityName: community,
    metrics: m,
    // Other fields (transitScore, topLanguages, accessGap) still come from
    // closure state, but the required fields are guaranteed by the call signature.
  }),
  [transitScore, topLanguages, accessGap, selectedAnchor],
);

// Call site: only invoke when data is ready
if (selectedCommunity && metrics) {
  const profile = buildProfile(selectedCommunity, metrics);
}
```

**Prevention:** Ban `!` (non-null assertions) in code review. For required fields, pass as parameters with proper types. Remaining closure dependencies should be listed in the `useCallback` dependency array so staleness is caught by the linter.

### 8. Double-Fire Toggle and Accessibility

**Problem:** Wrapper `<div onClick>` + checkbox `<input onChange>` both called `onToggleChoropleth`, causing the toggle to fire twice per click (net no-op). Additionally, `readOnly` is invalid on checkboxes and breaks keyboard accessibility.

**Fix:** Single handler on the checkbox only:

```typescript
<div className="...">
  <label>
    <input type="checkbox" checked={showChoropleth} onChange={onToggleChoropleth} />
    Access Gap Layer
  </label>
</div>
```

**Prevention:** Use one event handler at the most specific level. Never use `readOnly` on checkboxes — use `onChange`.

### 9. Callback Instability Breaking React.memo

**Problem:** Inline arrow functions as props to memoized `SanDiegoMap` created new references every render, defeating `React.memo`.

**Fix:** Extract to `useCallback`:

```typescript
const handleToggleChoropleth = useCallback(
  () => setShowChoropleth(prev => !prev),
  [],
);
```

**Prevention:** All function props passed to `React.memo` components must be wrapped in `useCallback`. Verify with React DevTools Profiler.

## Quick Checklist: Leaflet + React Integration

Before shipping a new Leaflet layer in React, verify:

- [ ] All callbacks passed to Leaflet use refs (see #3)
- [ ] `<GeoJSON>` key includes async dependency identity (see #2)
- [ ] Tooltips/popups use DOM elements, not HTML strings (see #1)
- [ ] Shared identifiers use a single normalization function (see #4)
- [ ] All async setState paths (effects AND callbacks) guard against staleness (see #6)
- [ ] Color/category functions tested with null, undefined, NaN, 0, boundaries (see #5)

## Test Coverage Added

- `scoreToColor`: null, undefined, NaN, 0, boundaries (20/40/60/80), negative, > 100
- `normalizeCommunityName`: client/server produce identical keys for mixed-case community names
