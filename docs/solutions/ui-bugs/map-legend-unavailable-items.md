---
title: "Hide unavailable legend items from map (Transit Stop + Your Block)"
date: "2026-03-23"
category: "ui-bugs"
problem_type: "Misleading UI — legend items displayed without corresponding markers"
component: "src/components/map/san-diego-map.tsx"
symptoms:
  - "Legend showed Transit Stop and Your Block items despite no markers visible on initial load"
  - "Transit Stop data was not loaded (empty array)"
  - "Your Block only appeared after user interaction, not on page load"
  - "Users confused by legend items with no visible corresponding content"
related_issues:
  - "#12"
  - "bookchiq/block-report#60"
tags:
  - legend
  - map-ui
  - marker-visibility
  - conditional-rendering
  - leaflet
---

# Hide unavailable legend items from map (Transit Stop + Your Block)

## Problem Symptom

The map legend in `src/components/map/san-diego-map.tsx` displayed four items — Library, Rec Center, Transit Stop, and Your Block — but only Library and Rec Center had reliable, always-visible markers.

- **Transit Stop**: The legend showed a violet dot, but transit stop data was not loaded (the `transitStops` prop arrived as an empty array), so no violet markers appeared on the map.
- **Your Block**: The orange marker only appeared after a user clicked a specific location. Showing it as a persistent legend item implied it should always be visible, causing confusion.

---

## Root Cause

The legend was hardcoded with all four data layers in the `<nav aria-label="Map legend">` block regardless of whether data was actually loaded or markers were rendered. There was no conditional rendering logic tying legend items to data availability.

This is a classic **"static UI declares dynamic reality"** bug — the legend acted as a declarative contract ("here's what you'll see"), but its items depended on backend data availability (transit stops) and user interaction timing (block data after map click).

---

## Investigation Steps

1. Identified that the legend was hardcoded with all 4 items at lines 326–333.
2. Confirmed that `transitStops` prop arrives as an empty array — no transit data loaded.
3. Verified that `pinnedLocation` is null initially and only becomes non-null after user click.
4. Confirmed Library and Rec Center always have data and always render markers.
5. Determined that marker rendering code for Transit Stop and Your Block remains intact and separate from the legend — removal was safe and reversible.

---

## Working Solution

**Commit:** `4d78149 fix(map): hide Transit Stop and Your Block from legend`

Removed the two `<li>` entries for Transit Stop (violet dot) and Your Block (orange dot) from the legend `<ul>` in `src/components/map/san-diego-map.tsx`:

```diff
 <nav aria-label="Map legend" className="...">
   <ul className="space-y-1.5">
     <li className="flex items-center gap-2">
       <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-blue-500 shrink-0" />
       <span className="text-gray-700">Library</span>
     </li>
     <li className="flex items-center gap-2">
       <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />
       <span className="text-gray-700">Rec Center</span>
     </li>
-    <li className="flex items-center gap-2">
-      <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-violet-600 shrink-0" />
-      <span className="text-gray-700">Transit Stop</span>
-    </li>
-    <li className="flex items-center gap-2">
-      <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-orange-500 shrink-0" />
-      <span className="text-gray-700">Your Block</span>
-    </li>
   </ul>
 </nav>
```

**Key points:**
- Removed 8 lines (two `<li>` blocks). No changes to marker rendering logic.
- All marker rendering code for Transit Stop and Your Block remains in place for future use.
- Library and Rec Center legend items are unchanged.
- The `<nav>` accessibility structure (`aria-label`) is preserved.

---

## Future Considerations

- **Transit Stop**: Re-add to the legend once transit data loading is confirmed working and the `transitStops` array is reliably populated.
- **Your Block**: Show dynamically — only render the legend item when `pinnedLocation` is truthy (i.e., user has clicked a location). This is a separate enhancement.

---

## Prevention Strategies

### 1. Derive Legend from Data, Not Constants

The core principle: **UI elements that represent data should only exist when that data exists.**

Instead of hardcoding legend items, compute them from the actual data props:

```tsx
const legendItems = [
  ...(libraries.length > 0 ? [{ label: 'Library', color: 'bg-blue-500' }] : []),
  ...(recCenters.length > 0 ? [{ label: 'Rec Center', color: 'bg-green-500' }] : []),
  ...(transitStops.length > 0 ? [{ label: 'Transit Stop', color: 'bg-violet-600' }] : []),
  ...(pinnedLocation ? [{ label: 'Your Block', color: 'bg-orange-500' }] : []),
];
```

### 2. Test Legend Rendering Against Data State

```tsx
it('should not show Transit Stop when transitStops is empty', () => {
  const { queryByText } = render(
    <SanDiegoMap transitStops={[]} {...otherProps} />
  );
  expect(queryByText(/Transit Stop/i)).not.toBeInTheDocument();
});

it('should show Your Block only when pinnedLocation is set', () => {
  const { queryByText, rerender } = render(
    <SanDiegoMap pinnedLocation={null} {...otherProps} />
  );
  expect(queryByText(/Your Block/i)).not.toBeInTheDocument();

  rerender(<SanDiegoMap pinnedLocation={{ lat: 32.7, lng: -117.2 }} {...otherProps} />);
  expect(queryByText(/Your Block/i)).toBeInTheDocument();
});
```

### 3. Pre-Ship Checklist for Legend Changes

- [ ] Legend items are computed from data state, not hardcoded
- [ ] Empty arrays result in omitted legend items
- [ ] Test with `transitStops = []` — legend should not show Transit
- [ ] Test with `pinnedLocation = null` — legend should not show Your Block
- [ ] Verify legend degrades gracefully when a backend endpoint returns an error

---

## Cross-References

- **Plan**: `plans/issue-12.md` — full specification for this fix
- **Related patterns**: `docs/solutions/integration-issues/citywide-comparison-review-integration-patterns.md` — similar geospatial rendering and ARIA accessibility patterns from the citywide comparison work
- **Upstream issue**: `bookchiq/block-report#60` — broader transit stop data loading reliability concern
