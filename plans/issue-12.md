---
title: "fix: Hide unavailable legend items from map"
type: fix
status: completed
date: 2026-03-23
---

# fix: Hide unavailable legend items from map (Transit Stop + Your Block)

## Overview

The map legend in `src/components/map/san-diego-map.tsx` displays four items — Library, Rec Center, Transit Stop, and Your Block — but only Library and Rec Center have reliable, always-visible markers. Transit Stop data is not loaded, and Your Block only appears after user interaction. Showing legend items without corresponding markers misleads users.

## Problem Statement

- **Transit Stop** — the legend shows a violet dot, but transit stop data is not loaded/available, so no violet markers appear on the map. The `transitStops` prop is passed but arrives as an empty array.
- **Your Block** — the orange marker only appears after a user clicks a specific location. Showing it as a persistent legend item implies it should always be visible, causing confusion.

## Proposed Solution

Remove the Transit Stop and Your Block `<li>` elements from the `<nav aria-label="Map legend">` block in `src/components/map/san-diego-map.tsx` (lines 326–333).

Keep Library (blue) and Rec Center (green) — both always have data and render markers.

### Future considerations

- **Transit Stop**: Re-add to the legend once transit data loading is confirmed working.
- **Your Block**: Show dynamically — only render the legend item when `pinnedLocation` is truthy (i.e., user has clicked a location). This is a separate enhancement and not part of this fix.

## Files to Change

| File | Change |
|------|--------|
| `src/components/map/san-diego-map.tsx:326-333` | Remove the two `<li>` entries for Transit Stop and Your Block from the legend `<ul>` |

## MVP

### src/components/map/san-diego-map.tsx

The legend block should go from 4 items to 2:

```tsx
<nav aria-label="Map legend" className="absolute bottom-8 left-2 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 text-xs print:hidden">
  <ul className="space-y-1.5">
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-blue-500 shrink-0" />
      <span className="text-gray-700">Library</span>
    </li>
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />
      <span className="text-gray-700">Rec Center</span>
    </li>
  </ul>
</nav>
```

## Acceptance Criteria

- [x] Transit Stop is not shown in the map legend
- [x] Your Block is not shown in the map legend
- [x] Library and Rec Center legend items remain unchanged
- [x] No other map functionality is affected (markers, popups, click behavior)
- [x] The legend still renders with proper styling and accessibility (`nav` with `aria-label`)

## Context

- The Transit Stop rendering code (lines 393–404) and Your Block/PinnedMarker code still exist in the component — only the legend entries are removed. The marker rendering logic is untouched in case transit data becomes available later.
- Related upstream issue: bookchiq/block-report#60

## Sources

- `src/components/map/san-diego-map.tsx:316-334` — current legend implementation
- GitHub issue #12
