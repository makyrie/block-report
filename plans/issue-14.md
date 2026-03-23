---
title: "feat: Persistent Print Flyer floating action button"
type: feat
status: completed
date: 2026-03-23
---

# feat: Persistent "Print Flyer" Floating Action Button

## Overview

Add a floating action button (FAB) that gives users one-click access to print the community flyer from anywhere on the neighborhood page. The FAB stays fixed in the viewport, appears only when report data has loaded, and adapts to mobile with a full-width bottom bar.

## Problem Statement / Motivation

Users who scroll past the flyer preview in the sidebar or are focused on the map/data may forget the print feature exists. A persistent, always-visible print action ensures the flyer is never more than one click away regardless of scroll position.

## Proposed Solution

Create a new `PrintFlyerFab` component in `src/components/flyer/` that renders a fixed-position button on the neighborhood page. The button calls `window.print()` directly (same mechanism as existing print buttons in `flyer-preview.tsx`).

### Key Decisions

1. **Component placement**: Render inside `NeighborhoodPage` (not in Layout), gated on `report !== null`. This keeps the FAB scoped to the correct route and avoids prop-drilling through the layout.
2. **Print mechanism**: Use `window.print()` directly — the existing `print.css` already handles showing only the `FlyerLayout` and hiding everything else via `body * { visibility: hidden }` + `.flyer-layout` overrides.
3. **Mobile adaptation**: On screens below `md` breakpoint, render as a full-width bottom bar positioned above the existing mobile tab bar (which is 48px tall).
4. **Attention pulse**: A subtle CSS animation on first appearance, dismissed when the user clicks the button. Track with React `useState` (not localStorage per issue spec).
5. **No new dependencies**: Follow codebase convention of inline SVG icons — reuse the printer icon pattern from `flyer-preview.tsx:196-201`.

## Technical Considerations

### Architecture

- **New file**: `src/components/flyer/print-flyer-fab.tsx` — single component, ~80 lines
- **Modified file**: `src/pages/neighborhood-page.tsx` — add FAB render (2-3 lines)
- **Modified file**: `src/print.css` — ensure FAB is hidden during print (already covered by `no-print` class, but verify)
- **i18n**: Add `flyer.printFlyer` translation key to all 6 languages in `src/i18n/translations.ts`

### Component Props

```typescript
interface PrintFlyerFabProps {
  visible: boolean; // report !== null && !reportLoading
}
```

### Desktop Layout

```
position: fixed
bottom: 24px (bottom-6)
right: 24px (end-6 for RTL support)
z-index: z-[900] (above Leaflet controls, below modals at z-[1000])
```

Rounded pill shape with printer icon + "Print Flyer" text. Warm styling: amber/orange accent color with a subtle paper texture shadow (not clinical blue). The `no-print` class hides it during printing.

Use Tailwind logical property `end-6` instead of `right-6` so the FAB flips to the left side when the layout is RTL (Arabic). The `Layout` component sets `dir="rtl"` for Arabic at `layout.tsx:10`.

### Mobile Layout

On screens below `md` breakpoint, switch to a full-width bottom bar:

```
position: fixed
bottom: 49px (above the existing mobile tab bar — tab bar is ~48px)
left: 0
right: 0
z-index: z-[900]
```

The existing mobile tab bar is at the bottom of the page in `neighborhood-page.tsx:385-418`. It is a flex child (not fixed-position), so it sits in normal document flow. The FAB bar uses `position: fixed` and positions itself above the tab bar with `bottom: 49px` (48px tab bar height + 1px border). This avoids overlapping the tab bar while keeping the print action visible.

The FAB bottom bar appears on **both** mobile tabs (map and info). The whole point of the FAB is persistent access regardless of current view — if it only showed on the `info` tab, the existing inline print button already covers that case.

### Modal Awareness

The `FlyerModal` in `flyer-preview.tsx` uses `z-[1000]` with a backdrop overlay. Since the FAB uses `z-[900]`, the modal's backdrop naturally covers it — no additional hiding logic needed. The modal has its own print button, so there's no loss of functionality.

This avoids the complexity of lifting `modalOpen` state from `FlyerPreview` up through `Sidebar` and `ReportView`, which would cross workstream boundaries (map workstream owns `Sidebar`).

### Attention Pulse

- On mount, a subtle ring animation plays using Tailwind's `motion-safe:animate-pulse` (respects `prefers-reduced-motion`).
- A small "New!" badge appears next to the text.
- After the user clicks the button once, `hasInteracted` state flips to `true` and the pulse/badge disappear.
- The pulse resets per report load (not per page mount). When the user changes communities, `report` resets to `null`, the FAB unmounts, and when the new report loads, a fresh FAB mounts with `hasInteracted = false`. This naturally gives one pulse per community.

### Click Debouncing

After clicking, disable the button for 1 second via `useState` + `setTimeout` to prevent rapid double-clicks in browsers where `window.print()` returns asynchronously (notably Chrome). The button shows a brief disabled state during the cooldown.

### Visual Design

- **Color**: Warm amber/orange gradient (`from-amber-500 to-orange-500`) to feel like "paper/document" rather than a generic action button. White text and icon.
- **Shadow**: `shadow-lg` with a slight warm tint for depth.
- **Icon**: Printer SVG (same path as `flyer-preview.tsx:198-199`) at `w-5 h-5`.
- **Text**: "Print Flyer" label (translated via `t('flyer.printFlyer')`).
- **Hover**: Slight scale-up (`hover:scale-105`) and deeper shadow.
- **Focus**: `focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2` for accessibility.

### Accessibility

- FAB is a semantic `<button>` element — natively focusable and activatable with Enter/Space.
- `aria-label` includes the visible text ("Print Flyer") — no additional label needed since the text is visible.
- Tab order: FAB is placed at the end of the `NeighborhoodPage` JSX (just before the print-only `FlyerLayout`), so it's the last tabbable element on the page. This avoids disrupting the natural tab flow.
- Pulse animation uses `motion-safe:` Tailwind variant to respect `prefers-reduced-motion`.
- Sufficient color contrast: white text on amber-500/orange-500 background meets WCAG AA.

## Edge Cases & Interactions

| Scenario | Behavior |
|----------|----------|
| Report loading | FAB hidden (`visible` prop is false) |
| Report loaded | FAB fades in with entry animation |
| User clicks Print | `window.print()` fires; pulse/badge dismissed; button disabled for 1s cooldown |
| Multiple rapid clicks | Button disabled for 1s after click prevents double-print in Chrome (async `window.print()`) |
| Flyer modal open | Modal backdrop at `z-[1000]` naturally covers FAB at `z-[900]`. No explicit hiding needed. Modal has its own print button. |
| Mobile — map tab active | FAB bottom bar visible above the tab bar (fixed-position, independent of tab content) |
| Mobile — info tab active | Same: FAB bottom bar visible above the tab bar |
| Mobile — tab bar collision | FAB uses `bottom: 49px` to sit above the 48px tab bar + 1px border. No overlap. |
| Community changes (slug change) | `report` resets to `null` in `neighborhood-page.tsx:109`, FAB unmounts. New report loads, FAB mounts fresh with pulse reset. |
| Language change | Same: `report` resets to `null` at `neighborhood-page.tsx:109`, FAB unmounts and remounts when new report arrives. |
| Print CSS | FAB uses `no-print` class, already targeted by `print.css:39` with `display: none !important`. |
| Keyboard navigation | FAB is a `<button>` element, naturally focusable and activatable with Enter/Space. Placed last in DOM for natural tab order. |
| RTL layout (Arabic) | Uses Tailwind `end-6` (logical property) instead of `right-6`, so FAB flips to bottom-left in RTL. |
| `prefers-reduced-motion` | Pulse animation wrapped in `motion-safe:` variant — skipped for users who prefer reduced motion. |
| Dual print buttons visible | When sidebar is scrolled to `FlyerPreview`, both inline print button and FAB are visible. Accepted: the FAB is primarily for when the preview is scrolled out of view; brief dual visibility is not confusing. |
| Navigation away | `NeighborhoodPage` unmounts entirely on route change; FAB disappears. |

## Acceptance Criteria

- [x] FAB appears on neighborhood page (`/neighborhood/:slug`) only when `report !== null`
- [x] FAB is hidden while report is loading
- [x] Clicking FAB triggers `window.print()` and produces the flyer
- [x] FAB has printer icon + translated "Print Flyer" text label
- [x] Desktop: fixed bottom-end position (RTL-aware), pill-shaped, warm visual style
- [x] Mobile: full-width bottom bar positioned above the existing tab bar (no overlap)
- [x] Mobile FAB visible on both map and info tabs
- [x] Subtle attention pulse on first appearance, dismissed after first click
- [x] Pulse resets when community changes (FAB remounts with new report)
- [x] Pulse respects `prefers-reduced-motion` via `motion-safe:` variant
- [x] Click debouncing: button disabled for 1s after click to prevent double-print
- [x] FAB is hidden during print (`no-print` class)
- [x] FAB naturally covered by flyer modal backdrop (z-index stacking: FAB at 900, modal at 1000)
- [x] Accessible: semantic `<button>`, focus-visible ring, natural tab order (last element)
- [x] i18n: "Print Flyer" text translated in all 6 supported languages
- [x] No new dependencies added

## Implementation Plan

### Phase 1: Component Creation

1. Create `src/components/flyer/print-flyer-fab.tsx`
   - Accepts `visible` boolean prop
   - Internal `hasInteracted` state for pulse dismissal
   - Internal `printing` state for 1s click debounce cooldown
   - Renders fixed-position button with printer icon + text
   - Desktop: `fixed bottom-6 end-6 z-[900]` pill shape
   - Mobile: `fixed bottom-[49px] inset-x-0 z-[900]` full-width bar (above 48px tab bar)
   - Uses `md:` breakpoint for responsive switch (matches existing codebase convention)
   - `no-print` class on root element
   - Fade-in entry animation via Tailwind transition classes
   - Pulse animation with `motion-safe:` variant
   - "New!" badge visible until `hasInteracted` is true
   - Calls `window.print()` on click, sets `printing = true` for 1s
   - Uses `useLanguage()` hook for translated text

2. Add i18n key `flyer.printFlyer` to all 6 languages in `src/i18n/translations.ts`:
   - en: "Print Flyer"
   - es: "Imprimir Volante"
   - vi: "In To Roi"
   - tl: "I-print ang Flyer"
   - zh: "打印传单"
   - ar: "طباعة النشرة"

### Phase 2: Integration

3. In `src/pages/neighborhood-page.tsx`, import and render `PrintFlyerFab`:
   ```tsx
   {/* After the mobile tab bar, before the print-only FlyerLayout */}
   <PrintFlyerFab visible={report !== null && !reportLoading} />
   ```

### Phase 3: Verify

4. Verify `print.css` hides the FAB during print (it should via `.no-print` selector at line 39)
5. Verify z-index stacking: FAB (900) < map controls (1000) < modal (1000 + backdrop)
6. Verify mobile FAB does not overlap the tab bar (49px bottom offset)
7. Verify FAB unmounts when community changes (report resets to null)
8. Verify RTL layout flips FAB to bottom-left (using `end-6`)

## Dependencies & Risks

- **Low risk**: This is a purely additive UI component with no backend changes.
- **Dependency**: Relies on existing `print.css` and `FlyerLayout` print mechanism working correctly.
- **Potential conflict**: The mobile bottom bar positioning (`bottom: 48px`) assumes the tab bar height doesn't change. If the tab bar is modified, the FAB position needs updating.
- **z-index stacking**: FAB at `z-[900]` is below map controls and modals at `z-[1000]`. The modal's backdrop naturally covers the FAB when open, which is the desired behavior.

## Sources & References

### Internal References

- Existing print mechanism: `src/components/flyer/flyer-preview.tsx:79` (`window.print()`)
- Printer icon SVG: `src/components/flyer/flyer-preview.tsx:196-201`
- Print CSS rules: `src/print.css:1-52`
- Report state management: `src/pages/neighborhood-page.tsx:43-44`
- Mobile tab bar: `src/pages/neighborhood-page.tsx:385-418`
- i18n translations: `src/i18n/translations.ts`
- Codebase pattern for icons: inline SVGs, no icon library

### Documented Learnings Applied

- From `docs/solutions/integration-issues/citywide-comparison-review-integration-patterns.md`:
  - Accessibility: use semantic `<button>` element with ARIA attributes (issue 11 pattern)
  - React memo not needed here (single element, not a list)
  - `no-print` class convention for print exclusion

### Related Issues

- GitHub Issue: makyrie/block-report#14
- Upstream Issue: bookchiq/block-report#67
