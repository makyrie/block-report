---
title: "feat: Add map layer filter to show all, libraries only, or rec centers only"
type: feat
status: completed
date: 2026-03-23
---

# feat: Add Map Layer Filter

## Overview

Add a segmented button group to the map that lets users filter which resource markers are visible: All (default), Libraries only, or Rec Centers only. This is a frontend-only change in a single file — no backend work, no data refetch, no new dependencies.

## Problem Statement

The map currently renders all resource markers (libraries, rec centers, transit stops) simultaneously. In dense neighborhoods this creates visual clutter and makes it hard to locate a specific resource type. Users need a way to toggle marker visibility by category.

## Proposed Solution

Add a `activeFilter` state variable to `SanDiegoMap` and a segmented button group control positioned above the existing legend. Conditionally render the library and rec center marker layers based on the active filter value. Transit stops and pinned block markers are unaffected by the filter.

### Filter State

```typescript
// src/components/map/san-diego-map.tsx
type MarkerFilter = 'all' | 'library' | 'rec_center';

const [activeFilter, setActiveFilter] = useState<MarkerFilter>('all');
```

### Conditional Rendering

```typescript
{/* Library markers — blue (shown when filter is 'all' or 'library') */}
{(activeFilter === 'all' || activeFilter === 'library') &&
  libraries.map((lib) => (
    <Marker ... />
  ))
}

{/* Rec center markers — green (shown when filter is 'all' or 'rec_center') */}
{(activeFilter === 'all' || activeFilter === 'rec_center') &&
  recCenters.map((rc) => (
    <Marker ... />
  ))
}
```

### Filter Control UI

A segmented button group positioned above the legend in the bottom-left corner. Uses existing Tailwind classes — no new CSS or dependencies.

```tsx
{/* Layer filter — bottom-left, above legend */}
<div
  role="radiogroup"
  aria-label="Filter map markers by type"
  className="absolute bottom-[7.5rem] left-2 z-[1000] flex rounded-lg overflow-hidden shadow-md print:hidden"
>
  {([
    { value: 'all', label: 'All' },
    { value: 'library', label: 'Libraries' },
    { value: 'rec_center', label: 'Rec Centers' },
  ] as const).map(({ value, label }) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={activeFilter === value}
      onClick={() => setActiveFilter(value)}
      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
        activeFilter === value
          ? 'bg-blue-600 text-white'
          : 'bg-white/90 text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  ))}
</div>
```

## Technical Considerations

- **No prop changes needed**: The filter is local state within `SanDiegoMap`. The parent component (`App.tsx`) is unaffected.
- **No type changes**: No modifications to `src/types/index.ts`.
- **Memo compatibility**: `SanDiegoMap` is wrapped in `memo()`. Since `activeFilter` is internal state (not a prop), it won't interfere with memoization — React handles internal state changes normally within memoized components.
- **Transit stops unaffected**: The issue scope covers libraries and rec centers only. Transit stops remain always visible.
- **Pinned location unaffected**: The orange pinned marker and block radius circle are independent of the filter.
- **Legend stays separate**: The legend shows all marker types regardless of active filter, serving as a color key rather than a filter control.

## Accessibility

- Use `role="radiogroup"` on the container with `aria-label="Filter map markers by type"`
- Each button gets `role="radio"` and `aria-checked` reflecting selection state
- Active button has sufficient color contrast (white text on blue-600 background)
- Buttons are keyboard-navigable by default as native `<button>` elements
- Add an `aria-live="polite"` visually-hidden region that announces the active filter (e.g. "Showing libraries only") so screen reader users know the map content changed
- Hidden from print via `print:hidden` (matches legend behavior)

## Positioning & Layout

The filter control sits above the existing legend at `bottom-[7.5rem] left-2`. The legend is at `bottom-8 left-2`. This gives ~3rem of space between them, preventing overlap. Both use `z-[1000]` to stay above the map tiles.

Existing map UI elements and their positions:
- **Legend**: `bottom-8 left-2` — below the filter
- **Leaflet zoom controls**: top-left (default) — no conflict
- **Attribution**: bottom-right (default) — no conflict

## Files to Change

| File | Change |
|------|--------|
| `src/components/map/san-diego-map.tsx` | Add `activeFilter` state, filter control UI, conditional marker rendering |

This is a single-file change within the `map` workstream's owned directory.

## Acceptance Criteria

- [x] Filter state type: `'all' | 'library' | 'rec_center'`
- [x] "All" is selected by default and shows all markers
- [x] Selecting "Libraries" hides rec center markers, shows only library markers
- [x] Selecting "Rec Centers" hides library markers, shows only rec center markers
- [x] Active filter button is visually distinct (blue background, white text)
- [x] Filter control does not overlap the legend or other map UI elements
- [x] Filter control is hidden when printing (`print:hidden`)
- [x] Filter uses proper ARIA roles (`radiogroup`, `radio`, `aria-checked`)
- [x] Transit stops and pinned block marker are unaffected by filter selection
- [x] Screen reader announcement via `aria-live="polite"` when filter changes

## Design Decisions

- **Transit stops excluded from filter**: Transit stops serve as geographic context and use `CircleMarker` (not `Marker`). They remain always visible. This is intentional scope — adding a transit filter option can be a follow-up.
- **Legend unchanged**: The legend remains static regardless of active filter. It serves as a color key reference, not a filter indicator. The active filter button itself is the visual indicator of what's shown.
- **Filter state is local**: State lives in `SanDiegoMap`, not lifted to parent. It's purely presentational — no other component needs it. Easy to lift later if needed.
- **Filter persists across community changes**: Switching communities does not reset the filter. The filter reflects a user viewing preference, not a per-community setting. It resets on page reload (no URL persistence).
- **selectedAnchor not cleared on filter change**: If a user clicks a library then filters to "Rec Centers only," the sidebar keeps showing the library's community data. The community-level info remains valid; clearing it would be disruptive.

## Edge Cases

- **No markers loaded yet**: Filter buttons still render and are selectable. When markers load, they respect the active filter. No special handling needed.
- **Community selection while filtered**: Clicking a marker triggers `onAnchorClick` normally. If a user filters to "Libraries" and clicks a library marker, the sidebar/profile opens as expected. The filter doesn't affect click behavior.
- **Rapid filter switching**: Since this is just conditional rendering (no async), React batches state updates naturally. No debounce needed.
- **Zero markers for a filter**: Some communities may have no libraries or no rec centers. Filtering to "Libraries only" in such an area shows no resource pins (transit stops still visible). No special empty-state handling — the user can switch back.
- **Open popup on filtered-out marker**: If a marker has an open popup and its type is filtered out, the marker and popup are removed from the DOM. This is expected React behavior and causes no errors.

## Sources

- Related upstream issue: [bookchiq/block-report#61](https://github.com/bookchiq/block-report/issues/61)
- Current map component: `src/components/map/san-diego-map.tsx`
- Existing pattern — legend overlay positioning: `san-diego-map.tsx:316-335`
- Solution doc on integration patterns: `docs/solutions/integration-issues/citywide-comparison-review-integration-patterns.md` (Leaflet overlay patterns, XSS escaping in tooltips)
