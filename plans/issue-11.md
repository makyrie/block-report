---
title: "fix: Hide Transit Stop and Your Block from map legend"
type: fix
status: completed
date: 2026-03-23
---

# fix: Hide Transit Stop and Your Block from map legend

## Overview

The map legend in `src/components/map/san-diego-map.tsx` displays **Transit Stop** and **Your Block** entries, but neither dataset is currently available on the map. This creates user confusion — legend items appear with no corresponding markers.

> **Note:** The GitHub issue references "Your Stop" but the codebase uses "Your Block" (line 332). Both refer to the same legend entry.

## Acceptance Criteria

- [x] Transit Stop is not visible in the map legend
- [x] Your Block (referred to as "Your Stop" in the issue) is not visible in the map legend
- [x] All other legend items (Library, Rec Center) remain unchanged
- [x] No other map functionality is affected

## Context

### Current legend code (`src/components/map/san-diego-map.tsx:315-335`)

The legend is a `<nav>` element with a `<ul>` containing four `<li>` items:
1. **Library** (blue dot) — has data, keep
2. **Rec Center** (green dot) — has data, keep
3. **Transit Stop** (violet dot) — no data available, **remove**
4. **Your Block** (orange dot) — no data available, **remove**

### Related code

- `MARKER_STYLES.transit` is defined at line 22 but unused for rendering markers — safe to leave for now (avoid scope creep)
- Transit stop markers section exists at line 392 but is effectively empty when no data loads
- The `Your Block` label also appears at line 117 in a tooltip for the pinned location radius circle — this is separate from the legend and should **not** be removed

## MVP

### `src/components/map/san-diego-map.tsx`

Remove the two `<li>` elements for Transit Stop (lines 326-329) and Your Block (lines 330-333) from the legend `<ul>`:

```tsx
// REMOVE these two list items from the legend:
<li className="flex items-center gap-2">
  <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-violet-600 shrink-0" />
  <span className="text-gray-700">Transit Stop</span>
</li>
<li className="flex items-center gap-2">
  <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-orange-500 shrink-0" />
  <span className="text-gray-700">Your Block</span>
</li>
```

The resulting legend will contain only Library and Rec Center entries.

## Sources

- Related issue: #11 (upstream: bookchiq/block-report#57)
- Primary file: `src/components/map/san-diego-map.tsx:315-335`
