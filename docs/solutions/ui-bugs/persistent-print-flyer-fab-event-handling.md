---
title: "Persistent Print Flyer FAB — Event Handling, Debouncing & Responsive Design"
problem_type: ui-bugs
component:
  - src/components/flyer/print-flyer-fab.tsx
  - src/pages/neighborhood-page.tsx
  - src/i18n/translations.ts
  - src/print.css
symptoms:
  - Arbitrary 1s setTimeout for print dialog completion was unreliable across browsers
  - Double-print possible in Chrome when clicking during the timeout window
  - State update on unmounted component warning without event listener cleanup
  - Mobile FAB overlapped existing tab bar navigation
tags:
  - floating-action-button
  - afterprint-event
  - click-debouncing
  - z-index-stacking
  - responsive-design
severity: medium
date_solved: "2026-03-23"
related_issues:
  - "#14 — Persistent Print Flyer floating action button"
commits:
  - bb50a90 — feat(flyer): add persistent Print Flyer floating action button
  - 6f2b3c6 — fix: use afterprint event instead of setTimeout in FAB, add cleanup
  - fcdf83f — fix: address P3 findings — pulse animation limit
---

## Problem

Users on the neighborhood page could only access the print flyer function via an inline button in the sidebar's flyer preview card. When users scrolled past the flyer preview or focused on the map, the print action was hidden. A persistent floating action button (FAB) was needed to provide one-click access from anywhere on the page.

The initial implementation introduced subtle bugs around print dialog completion detection and double-click prevention that required follow-up fixes.

## Root Cause Analysis

### 1. setTimeout Is Unreliable for Print Dialog Completion

The initial implementation used `setTimeout(() => setPrinting(false), 1000)` after calling `window.print()`. This was problematic because:

- `window.print()` is synchronous in some browsers (Firefox) but triggers an async dialog in others (Chrome)
- A 1-second timeout has no relationship to when the user actually dismisses the print dialog
- During the timeout window, the button could be clicked again, causing double-print in Chrome
- After timeout expires, the button re-enables even if the dialog is still open

### 2. Missing Event Listener Cleanup

Without cleanup in `useEffect`, the `afterprint` listener persists after component unmount, causing React warnings about state updates on unmounted components and potential memory leaks on repeated mount/unmount cycles.

### 3. Infinite Pulse Animation

The original attention pulse had no iteration limit, potentially draining battery on mobile devices and creating an annoying visual distraction.

## Solution

### Phase 1: Core FAB Component (commit bb50a90)

Created `PrintFlyerFab` with responsive desktop/mobile layouts:

```tsx
// src/components/flyer/print-flyer-fab.tsx (simplified — initial version before afterprint fix)
export function PrintFlyerFab({ visible }: PrintFlyerFabProps) {
  const { t } = useLanguage();
  const [hasInteracted, setHasInteracted] = useState(false);
  const [printing, setPrinting] = useState(false);

  if (!visible) return null;

  const handleClick = () => {
    if (printing) return;       // Guard against re-entrance
    setHasInteracted(true);     // Dismiss pulse + "New" badge
    setPrinting(true);          // Disable button immediately
    window.print();
    setTimeout(() => setPrinting(false), 1000); // ← unreliable, fixed in Phase 2
  };

  // Desktop: pill-shaped button, bottom-end
  // Mobile: full-width bar above tab bar (bottom: 49px)
}
```

Integration in `neighborhood-page.tsx` is minimal:
```tsx
<PrintFlyerFab visible={report !== null && !reportLoading} />
```

### Phase 2: afterprint Event Fix (commit 6f2b3c6)

Replaced setTimeout with the browser's `afterprint` event, which fires reliably when the print dialog closes (whether the user prints, cancels, or saves to PDF):

```tsx
const handleAfterPrint = useCallback(() => setPrinting(false), []);

useEffect(() => {
  window.addEventListener('afterprint', handleAfterPrint);
  return () => window.removeEventListener('afterprint', handleAfterPrint);
}, [handleAfterPrint]);
```

**Why afterprint is better:**

| Approach | Reliability | Issue |
|----------|-------------|-------|
| `setTimeout(1000)` | Low | Arbitrary timing, double-print risk, blocks button too long |
| `afterprint` event | High | Event-driven, fires on cancel/print/save, immediate response |

### Phase 3: Animation Limit (commit fcdf83f)

Limited pulse to exactly 3 iterations to save battery:
```tsx
motion-safe:animate-[pulse_2s_ease-in-out_3]
```

## Key Design Decisions

### Z-Index Stacking

```
z-[1000]  Modal backdrop (FlyerModal) — covers FAB when modal is open
z-[900]   FAB (desktop pill + mobile bar) — above map controls
z-0       Page content
```

No explicit "hide FAB when modal opens" logic needed — the modal backdrop naturally covers it. This avoids lifting `modalOpen` state across workstream boundaries.

### Responsive Layout

- **Desktop (≥768px):** Pill-shaped button at `bottom-6 end-6` (RTL-aware via logical property)
- **Mobile (<768px):** Full-width bar at `bottom-[49px]` (above 48px tab bar + 1px border)

Both variants share the same click handler, state, and accessibility features.

### Print CSS Integration

The FAB carries the `no-print` class, which `src/print.css` hides via `display: none !important`. No additional CSS was needed — the existing print stylesheet already covered this pattern.

## Prevention Strategies

### 1. Never Use setTimeout for Print Dialog Completion

Always use the `afterprint` event. It fires reliably across all modern browsers (IE11+) on print, cancel, or save-to-PDF. The event is the only way to know when the user actually dismisses the dialog.

### 2. Guard + Disable for Click Debouncing

Use both a state guard (`if (printing) return`) AND the HTML `disabled` attribute. The guard prevents logical re-entrance; `disabled` prevents user interaction and provides visual feedback. This combination is defense-in-depth against double-print in Chrome.

## Related Documentation

- [Citywide Comparison Integration Patterns](../integration-issues/citywide-comparison-review-integration-patterns.md) — `.no-print` class convention, z-index stacking
- `src/components/flyer/flyer-preview.tsx` — existing print button using same `window.print()` mechanism, modal at z-[1000]
- `plans/issue-14.md` — original implementation plan with full spec
