---
title: "Incomplete Feature Removal — Transit Stop Legend & Map Infrastructure"
date: "2026-03-23"
category: "ui-bugs"
problem_type: "incomplete-removal"
components:
  - "src/components/map/san-diego-map.tsx"
  - "src/pages/neighborhood-page.tsx"
  - "server/routes/locations.ts"
  - "src/api/client.ts"
related_issues:
  - "#11"
commits:
  - "f9bb420"
  - "6f6467b"
  - "bf28304"
---

# Incomplete Feature Removal — Transit Stop Legend & Map Infrastructure

## Problem

The map legend displayed **Transit Stop** (violet dot) and **Your Block** (orange dot) entries, but neither dataset was rendered on the map. This created user confusion — legend items appeared with no corresponding markers.

**Symptom**: Two phantom legend entries visible in the map nav with no matching markers on the map.

## Root Cause

The legend entries referenced features that were either never fully wired up (Your Block) or no longer rendered (Transit Stop). The initial fix removed only the visible `<li>` elements from the legend but left the entire transit stop infrastructure in place across the stack.

## Solution — Three-Commit Evolution

The fix required three iterations, each caught by code review:

### Commit 1: Legend UI Removal (`f9bb420`)

Removed two `<li>` elements from the legend `<nav>` in `san-diego-map.tsx`:

```tsx
// REMOVED — Transit Stop and Your Block legend entries
<li className="flex items-center gap-2">
  <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-violet-600 shrink-0" />
  <span className="text-gray-700">Transit Stop</span>
</li>
<li className="flex items-center gap-2">
  <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-orange-500 shrink-0" />
  <span className="text-gray-700">Your Block</span>
</li>
```

**What was missed**: The rendering code, components, state, props, and API layer all remained.

### Commit 2: Frontend Infrastructure Cleanup (`6f6467b`)

Review found that CircleMarker rendering, supporting components, and state management were left behind.

Removed from `san-diego-map.tsx`:
- `CircleMarker` import from react-leaflet
- `TransitStop` type import
- `transit` entry from `TYPE_CONFIG` record
- `TransitPopupContent` component (entire function)
- `transitStops` prop from `SanDiegoMapProps` interface and function signature
- Transit stop `CircleMarker` rendering loop (~14 lines of JSX)

Removed from `neighborhood-page.tsx`:
- `getTransitStops` import from API client
- `TransitStop` type import
- `transitStops` state hook (`useState<TransitStop[]>([])`)
- `getTransitStops().then(setTransitStops)` fetch call in `useEffect`
- `transitStops={transitStops}` prop on `<SanDiegoMap>`

### Commit 3: Backend Dead Code Removal (`bf28304`)

Review found that the REST endpoint and client function were now unreachable.

Removed from `server/routes/locations.ts`:
- `GET /api/locations/transit-stops` route handler (transit data is consumed server-side by `transit-scores.ts` via Prisma, not through REST)

Removed from `src/api/client.ts`:
- `getTransitStops()` function export
- `TransitStop` type import

## Investigation: What Was Missed and Why

| Iteration | Scope | Why Missed |
|-----------|-------|------------|
| Commit 1 | Legend `<li>` elements only | Focused on the reported symptom; 8-line change seemed complete |
| Commit 2 | Rendering, components, state, props | Infrastructure was scattered across 2 files, not obviously connected to legend |
| Commit 3 | REST endpoint, API client function | Backend route looked "normal" and wasn't broken — just unreachable |

The core issue: **removing the visible tip of the iceberg while leaving the infrastructure beneath**. Each layer was only discovered when a reviewer traced the dependency chain beyond the immediate fix.

## Prevention: Feature Removal Checklist

When removing or hiding a feature in a React + Express app, trace these layers:

1. **Visual UI** — Components, JSX rendering, legend/nav entries
2. **Supporting components** — Popup content, badges, tooltips specific to the feature
3. **Configuration** — Type config records, marker styles, color constants
4. **Props threading** — Interface definitions, prop passing through component hierarchy
5. **State management** — `useState` hooks, context values, reducer cases
6. **Data fetching** — `useEffect` calls, fetch triggers, AbortControllers
7. **API client** — Frontend fetch wrapper functions and their type imports
8. **Backend routes** — Express route handlers, middleware specific to the feature
9. **Backend services** — Data fetching/processing functions (check if still used elsewhere)
10. **Types** — Shared interfaces, union types that include the feature

**Key question at each layer**: Is this code still reachable? If not, delete it.

## Best Practices

- **Decide upfront: hide or remove.** "Hide" means conditional rendering with infrastructure intact. "Remove" means delete all layers. Issue #11 ultimately chose "remove."
- **Search the codebase after each deletion.** Grep for the feature name (`transitStops`, `TransitStop`, `transit-stops`) to find orphaned references.
- **Commit atomically per layer.** Group related deletions (e.g., all frontend infrastructure in one commit) for clean history.
- **Review traces dependencies, not just diffs.** The reviewer who caught commit 2 traced `transitStops` prop usage — not just the changed lines.
- **Check if backend endpoints have other consumers.** In this case, `transit-scores.ts` uses Prisma directly, so the REST endpoint was truly dead. Always verify before deleting.
