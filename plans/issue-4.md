---
title: "feat: Dual-scale view — show block and neighborhood context simultaneously"
type: feat
status: completed
date: 2026-03-19
---

# Dual-Scale View — Show Block and Neighborhood Context Simultaneously

## Overview

When a user clicks on the map to pin a location, the sidebar currently only shows neighborhood-level data. Block-level data appears only in a map popup. This feature integrates both scales into a unified sidebar view with comparison callouts that highlight where the two scales tell an interesting story — making hyperlocal data meaningful through neighborhood context.

## Problem Statement

Block-level data ("3 pothole reports near you") is meaningless without context. Users need to see how their immediate area compares to the broader neighborhood to understand whether their experience is typical, better, or worse than average. Currently, these two data views are disconnected — neighborhood metrics in the sidebar, block metrics in a popup.

## Proposed Solution

Create a **dual-scale panel** in the sidebar that appears when a user has both a pinned location (block data) and a selected community (neighborhood data). The panel shows:

1. **Block-level section** — "Around your pin" with key metrics from `/api/block`
2. **Neighborhood-level section** — "Across {Community}" with key metrics from `/api/311`
3. **Comparison callouts** — auto-generated plain-language insights comparing the two scales

The map already visually shows both scales (orange radius circle + blue neighborhood boundary). No map changes needed.

## Technical Approach

### Architecture

This is a **frontend-only change**. Both datasets are already fetched and available in `neighborhood-page.tsx` state:
- `blockData: BlockMetrics | null` — from `/api/block?lat=X&lng=Y&radius=Z`
- `metrics: NeighborhoodProfile['metrics'] | null` — from `/api/311?community={name}`

The comparison logic is pure computation on these two objects — no new API calls needed.

### Critical Gap: Point-in-Polygon Auto-Detection

**Problem:** Currently, `handleMapClick` in `neighborhood-page.tsx` only sets `pinnedLocation` and fetches block data — it does NOT determine which neighborhood the clicked point falls in. The `selectedCommunity` is only set when the user explicitly picks from the dropdown or clicks an anchor marker. This means clicking the map alone won't trigger dual-scale view unless a neighborhood is already selected.

**Solution:** When the user clicks the map, perform a client-side point-in-polygon check against the already-loaded `neighborhoodBoundaries` GeoJSON to auto-detect the enclosing neighborhood. If the click is inside a known boundary, auto-select that community (which triggers neighborhood data fetching). Use a simple ray-casting algorithm — no new dependency needed since the GeoJSON data is already in state.

### Implementation Phases

#### Phase 1: Point-in-Polygon Utility + Map Click Enhancement

**File: `src/utils/point-in-polygon.ts`**

```typescript
import type { FeatureCollection } from 'geojson';

/**
 * Given a lat/lng and the neighborhoods GeoJSON, return the community name
 * that contains the point, or null if outside all boundaries.
 * Uses ray-casting algorithm on polygon rings.
 */
export function findCommunityAtPoint(
  lat: number,
  lng: number,
  boundaries: FeatureCollection,
): string | null { ... }
```

**Changes to `src/pages/neighborhood-page.tsx`:**
- In `handleMapClick`, after setting `pinnedLocation`, call `findCommunityAtPoint(lat, lng, neighborhoodBoundaries)`.
- If a community is found AND it differs from `selectedCommunity`, auto-navigate to that community (triggering neighborhood data fetch).
- This ensures that clicking the map is sufficient to activate the dual-scale view.

#### Phase 2: Comparison Callout Logic

Create a utility function that takes `BlockMetrics` and neighborhood `metrics` and produces an array of plain-language comparison strings.

**File: `src/utils/scale-comparisons.ts`**

```typescript
interface ScaleComparison {
  text: string;
  type: 'insight' | 'good-news' | 'concern';
}

export function generateComparisons(
  block: BlockMetrics,
  neighborhood: NeighborhoodProfile['metrics'],
  communityName: string,
): ScaleComparison[] { ... }
```

Comparison rules (generate up to 4, show 2-3 best):

| Comparison | Condition | Template |
|---|---|---|
| Open count | block.openCount vs neighborhood total open | "Your block has {N} open reports. Across {community}, there are {M} unresolved issues." |
| Resolution rate | Difference > 10 percentage points | "Around your pin, {X}% of issues are resolved — {higher/lower} than the {Y}% rate across {community}." |
| Response time | Both non-null, difference > 2 days | "Issues near you take about {X} days to resolve — {faster/slower} than the {community} average of {Y} days." |
| Top issue match | Compare #1 issue category | "'{Category}' is the top issue both near you and across {community}." OR "Near you it's '{A}', but neighborhood-wide it's '{B}'." |

Edge cases to handle:
- `block.totalRequests === 0` → "No reports found near your pin within {radius} miles. Try a larger radius."
- `block.totalRequests < 5` → Skip ratio-based comparisons (too few data points to be meaningful)
- `block.avgDaysToResolve === null` → Skip response time comparison
- `neighborhood.totalRequests311 === 0` → Skip all comparisons (guard)
- Division by zero in ratios → Skip that comparison
- Same values (within 5%) → "Your block mirrors the neighborhood average" (neutral callout)

#### Phase 3: Dual-Scale Sidebar Component

Create a new component that renders the dual-scale view when both datasets are available.

**File: `src/components/ui/dual-scale-view.tsx`**

Layout:
```
┌─────────────────────────────┐
│  Around Your Pin            │  ← Block-level header
│  0.25 mi radius             │
│                             │
│  ┌─────┐ ┌─────┐ ┌───────┐ │
│  │  3  │ │  8  │ │ 73%   │ │  ← Big number cards
│  │open │ │resol│ │resolv │ │
│  └─────┘ └─────┘ └───────┘ │
│                             │
│  Top issues: Potholes (5),  │
│  Graffiti (3), Dumping (2)  │
├─────────────────────────────┤
│  Comparisons                │  ← Callout section
│                             │
│  • Your block has 3 open    │
│    reports. Across Mira     │
│    Mesa, there are 891.     │
│                             │
│  • Issues near you take ~5  │
│    days — faster than the   │
│    11-day neighborhood avg. │
└─────────────────────────────┘
```

Props:
```typescript
interface DualScaleViewProps {
  blockData: BlockMetrics;
  blockRadius: number;
  communityName: string;
  metrics: NeighborhoodProfile['metrics'];
}
```

The component:
- Renders a block-level summary card (compact — open/resolved/rate)
- Shows the comparison callouts with appropriate styling (insight=blue, good-news=green, concern=amber)
- Does NOT duplicate the full neighborhood sidebar — the existing sidebar content continues below

#### Phase 4: Integration into Sidebar + State Management

Modify `sidebar.tsx` to accept and display the dual-scale view.

**Changes to `src/components/ui/sidebar.tsx`:**
- Add `blockData`, `blockRadius`, `blockLoading` props to `SidebarProps`
- When `blockData` is present AND `metrics` is present, render `<DualScaleView>` at the top of the sidebar (before the existing neighborhood content)
- When `blockLoading` is true, show a compact skeleton/spinner in the dual-scale position
- The existing neighborhood content remains unchanged — it becomes the "Across {Community}" section naturally

**Changes to `src/pages/neighborhood-page.tsx`:**
- Pass `blockData`, `blockRadius`, and `blockLoading` to `<Sidebar>`
- **State clearing**: Clear `pinnedLocation`, `blockData` when the user changes neighborhood via the dropdown selector (not when auto-switched via map click). This prevents stale block data from a different neighborhood persisting after manual navigation.

## System-Wide Impact

- **Interaction graph**: Map click → `handleMapClick` → `findCommunityAtPoint` (new) → `setSelectedCommunity` (if changed) → triggers neighborhood data fetch → both datasets available → `<DualScaleView>` renders in sidebar
- **Error propagation**: Block data fetch failure already caught in `handleMapClick`. Point-in-polygon returns null on failure (graceful). No new error paths.
- **State lifecycle risks**: Stale block data when neighborhood changes via dropdown. Mitigated by clearing block state on manual neighborhood change.
- **API surface parity**: No API changes. Block popup still works independently. Sidebar gains new section but existing content unchanged.

## Acceptance Criteria

### Functional Requirements

- [x] When a user clicks the map, the enclosing neighborhood is auto-detected from GeoJSON boundaries and selected
- [x] When a user has both a pinned location and a selected community, the sidebar shows both block and neighborhood data
- [x] At least 3 comparison types are implemented (open count, resolution rate, response time, top issue)
- [x] Only 2-3 of the most relevant comparisons are displayed per view (skip trivial/null ones)
- [x] Comparisons use plain language — no percentages in isolation, no statistical jargon
- [x] Block-level summary shows open count, resolved count, and resolution rate as compact number cards
- [x] When block data has 0 total requests, show a message suggesting a larger radius instead of empty comparisons
- [x] When block data has fewer than 5 reports, skip ratio-based comparisons (too few data points)
- [x] Existing neighborhood sidebar content remains unchanged and visible below the dual-scale section

### Edge Cases

- [x] No pinned location → Sidebar shows only neighborhood data (current behavior, unchanged)
- [x] Pinned location but no community selected (click outside all boundaries) → Block data shows in map popup only
- [x] Block data loading → Show skeleton/spinner in the dual-scale section
- [x] Block has 0 reports → Show "No reports found nearby" message with radius suggestion
- [x] `avgDaysToResolve` is null for block → Skip response time comparison
- [x] Pin outside currently selected neighborhood (manual dropdown change after pinning) → Clear block data
- [x] Mobile: dual-scale view works within the existing "info" tab without horizontal overflow

### Non-Functional Requirements

- [x] No new API endpoints — all data already available
- [x] No new npm dependencies — ray-casting is simple enough to implement inline
- [x] Comparison logic is deterministic and testable (pure function)
- [x] Component follows existing Tailwind styling patterns
- [x] Accessible — proper headings, ARIA labels, color contrast

## Files to Create

| File | Purpose |
|------|---------|
| `src/utils/point-in-polygon.ts` | Ray-casting point-in-polygon check against GeoJSON boundaries |
| `src/utils/scale-comparisons.ts` | Pure function: `generateComparisons(block, neighborhood, name)` → `ScaleComparison[]` |
| `src/components/ui/dual-scale-view.tsx` | Dual-scale panel component for the sidebar |

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/neighborhood-page.tsx` | Auto-detect community on map click; pass `blockData`/`blockRadius`/`blockLoading` to Sidebar; clear block state on manual neighborhood change |
| `src/components/ui/sidebar.tsx` | Add `blockData`/`blockRadius`/`blockLoading` props; render `<DualScaleView>` when both datasets present |

## Files NOT Modified

- `server/*` — No backend changes
- `src/components/map/san-diego-map.tsx` — Map already shows both visuals (orange circle + blue boundary)
- `src/types/index.ts` — Existing `BlockMetrics` and `NeighborhoodProfile` types already cover both scales
- `src/components/flyer/*` — Flyer layout is out of scope for this change (remains neighborhood-only)

## Decisions and Scope Boundaries

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Point-in-polygon approach | Client-side ray-casting on loaded GeoJSON | GeoJSON already in state; no new dependency or API call needed |
| Where comparisons render | Sidebar only (not in map popup) | Sidebar can scroll; popup has width/persistence constraints |
| Minimum data threshold | 5 block reports for ratio comparisons | Avoid misleading stats from tiny sample sizes |
| Pin outside neighborhood | Clear block state on manual dropdown change | Prevents cross-neighborhood comparisons; map clicks auto-switch |
| Flyer/print | No changes | Block comparisons are screen-only; flyer remains neighborhood-level |
| i18n | English-only for callout text initially | Can add translation keys in follow-up |
| Map visual changes | None | Orange circle + blue boundary already provide dual-scale visual |

## Dependencies & Risks

- **Low risk**: This is purely additive frontend work. No API changes, no type changes, no shared file conflicts.
- **Data dependency**: The dual-scale view only appears when BOTH `blockData` AND `metrics` are non-null. With auto-detection, a single map click should be sufficient.
- **Potential UX concern**: The sidebar could feel long. Mitigate by keeping the block summary compact (3 number cards + callouts, not a full repeat of every metric).
- **Geographic edge case**: Points on neighborhood boundaries may match either or neither community. The ray-casting algorithm will pick one deterministically; this is acceptable.
- **Large radius overlap**: At 1mi radius, block data may include requests from adjacent neighborhoods. This is a known imprecision, not a blocker.

## Sources & References

### Internal References

- Block data flow: `src/pages/neighborhood-page.tsx:202-224` (handleMapClick, blockData state)
- Neighborhood metrics flow: `src/pages/neighborhood-page.tsx:66-103` (community data fetching)
- Block popup component: `src/components/map/san-diego-map.tsx:88-180` (BlockPopupContent)
- Sidebar component: `src/components/ui/sidebar.tsx:63-386`
- Neighborhood GeoJSON: `src/pages/neighborhood-page.tsx:59` (neighborhoodBoundaries state, already loaded on mount)
- Type definitions: `src/types/index.ts:59-68` (BlockMetrics), `src/types/index.ts:13-50` (NeighborhoodProfile)
- Block API endpoint: `server/routes/block.ts:23-120`
- 311 API endpoint: `server/routes/metrics.ts`

### Related Work

- GitHub Issue: makyrie/block-report#4
- Upstream Issue: bookchiq/block-report#27
