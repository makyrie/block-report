---
title: "feat: Citywide Comparison View — Choropleth Map with Access Gap Ranking"
type: feat
status: completed
date: 2026-03-18
---

# feat: Citywide Comparison View — Choropleth Map with Access Gap Ranking

## Overview

Add a citywide view that visualizes access gap scores across all San Diego neighborhoods using a choropleth map and ranked list. This is the single most impactful demo feature — instead of showing one neighborhood at a time, it shows the whole city with underserved areas highlighted.

## Problem Statement / Motivation

The app currently shows one neighborhood at a time. The most powerful insight is the *comparison*: which neighborhoods have access gaps and how they compare. A citywide view makes the pattern visible at a glance and dramatically improves demo impact.

## Proposed Solution

A new `/citywide` route with a split-panel layout:
- **Left panel**: Leaflet choropleth map shading each community planning area by access gap score (darker = higher gap = more underserved)
- **Right panel**: Ranked list of communities sorted by score, with contributing factor badges
- **Top bar**: Summary stats ("We analyzed X neighborhoods. Y show signs of potential service access gaps.")
- **Click-through**: Clicking any community (map or list) navigates to `/neighborhood/{slug}`

### Key Insight: Most Infrastructure Already Exists

The backend already has:
- Access gap scoring for all communities (`server/services/gap-analysis.ts`)
- Ranking endpoint (`GET /api/access-gap/ranking?limit=N`)
- Community boundary GeoJSON fetched from SD open data portal
- Frontend API client with `getAccessGapRanking()` and `getNeighborhoodBoundaries()`

What's needed is primarily **frontend work**: a new page, a choropleth Leaflet layer, and a ranked list component.

## Technical Approach

### Phase 1: Backend — Expand Ranking Endpoint

**File: `server/routes/gap-analysis.ts`**

The existing `/api/access-gap/ranking` endpoint caps at 50 results. For the citywide view, it needs to return **all** communities with their scores. Modify to accept `limit=0` or `limit=all` to return the full set.

Add a `topFactors` field to each ranking entry — a human-readable array of the 1-2 strongest signals (e.g., "low engagement", "limited transit", "68% non-English speaking"). This avoids the frontend having to interpret raw signal numbers.

```typescript
// server/routes/gap-analysis.ts — enhanced ranking response shape
interface CitywideCommunity {
  community: string;           // display name (mixed case)
  accessGapScore: number;      // 0-100
  signals: {
    lowEngagement: number | null;
    lowTransit: number | null;
    highNonEnglish: number | null;
  };
  topFactors: string[];        // NEW: human-readable top contributors
  rank: number;
  totalCommunities: number;
}
```

**File: `server/services/gap-analysis.ts`**

Add a helper function `describeTopFactors(signals)` that converts signal values to readable strings. For each signal > 0.5 (i.e., contributes meaningfully), generate a description:
- `lowEngagement > 0.5` → "low civic engagement"
- `lowTransit > 0.5` → "limited transit access"
- `highNonEnglish > 0.5` → `"${Math.round(highNonEnglish * 100)}% non-English speaking"`

Also export `getAccessGapScores()` return as an array (not just Map) for easier consumption, or add a new `getAllScoresRanked()` that returns the full ranked list.

**File: `src/api/client.ts`**

Add a new function:

```typescript
// src/api/client.ts
export function getCitywideGaps(): Promise<{
  ranking: CitywideCommunity[];
  summary: { total: number; withGaps: number };
}> {
  return fetchJSON(`${BASE}/access-gap/ranking?limit=0`);
}
```

### Phase 2: Frontend — Citywide Page

**File: `src/pages/citywide-page.tsx`** (NEW)

The main page component that orchestrates data fetching and layout.

```
┌─────────────────────────────────────────────────────┐
│  Summary Bar: "Analyzed 42 neighborhoods. 15 show   │
│  signs of potential service access gaps."            │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│   Choropleth Map         │   Ranked List            │
│   (Leaflet + GeoJSON)    │   (scrollable)           │
│                          │                          │
│   Darker = higher gap    │   #1 San Ysidro (78)     │
│                          │   #2 Barrio Logan (74)   │
│                          │   #3 Southeastern (71)   │
│                          │   ...                    │
│                          │                          │
├──────────────────────────┴──────────────────────────┤
│  Legend: color scale + what "access gap" means       │
└─────────────────────────────────────────────────────┘
```

**Data fetching**: On mount, call `getCitywideGaps()` and `getNeighborhoodBoundaries()` in parallel. Both are cached server-side (24h TTL), so subsequent loads are fast.

**Mobile layout**: Stack vertically — summary on top, map (full-width, 50vh), then ranked list below. Use the same mobile toggle pattern from `neighborhood-page.tsx`.

**Loading state**: Show a skeleton/spinner while data loads. The map can render its base tile layer immediately; the choropleth fills in once GeoJSON + scores arrive.

**Error state**: If the ranking endpoint fails, show a friendly message with a retry button. The boundary GeoJSON is non-critical — if it fails, fall back to showing just the ranked list without the map.

### Phase 3: Choropleth Map Component

**File: `src/components/map/citywide-choropleth.tsx`** (NEW)

A Leaflet GeoJSON layer that colors each community polygon by its access gap score.

**Color scale**: Use a sequential color ramp from light (low gap, score ~0-20) to dark (high gap, score ~80-100). A red-orange palette works well for "heat" / urgency:
- 0-20: `#fee5d9` (very light)
- 21-40: `#fcae91`
- 41-60: `#fb6a4a`
- 61-80: `#de2d26`
- 81-100: `#a50f15` (darkest)

**Implementation approach**:
1. Join `ranking` data to `boundaries` GeoJSON features by matching `community` name (uppercase) to `feature.properties.cpname` (uppercase)
2. For each feature, set `style` function:
   - `fillColor` from score → color scale
   - `fillOpacity: 0.7`
   - `weight: 1`, `color: white` for borders
3. Add `onEachFeature` handler:
   - Hover: highlight border (thicker, brighter) + show tooltip with name and score
   - Click: navigate to `/neighborhood/{slug}`
4. Leaflet's `GeoJSON` component re-renders on data change via `key` prop

**Tooltip on hover**: Show community name, score, and top factors. Use Leaflet's built-in tooltip (not popup) for hover-only display.

**Integration with existing map**: This is a *separate* map component from `san-diego-map.tsx`. The citywide view doesn't need markers for individual libraries/rec-centers/transit — it's a pure choropleth. This avoids prop conflicts and keeps the existing map untouched.

### Phase 4: Ranked List Component

**File: `src/components/ui/citywide-ranking.tsx`** (NEW)

A scrollable list showing all communities ranked by access gap score.

Each row shows:
- Rank number (bold)
- Color swatch matching the choropleth color for that score
- Community name (clickable → navigates to detail)
- Score (bold number)
- Top factor badges (small pills, e.g., "low engagement", "limited transit")

**Highlight on hover**: When user hovers a list row, highlight the corresponding polygon on the map (and vice versa — hovering a polygon highlights the list row). This requires lifting hovered-community state to the parent `citywide-page.tsx`.

**Score threshold**: Communities with score >= 50 could be flagged with a subtle indicator (e.g., a small warning icon or "high" label) to help users quickly identify the most underserved areas.

### Phase 5: Routing & Navigation

**File: `src/main.tsx`**

Add route:
```tsx
<Route path="/citywide" element={<CitywidePage />} />
```

**File: `src/pages/welcome-page.tsx`**

Add a prominent card/button linking to `/citywide` — visually similar to the flyer shortcut card but for the citywide view. Place it above the neighborhood picker to make it discoverable.

**File: `src/components/layout/layout.tsx`**

If there's a nav header, add a "Citywide" link.

**File: `src/pages/neighborhood-page.tsx`**

Add a "Back to citywide view" link/button in the header area so users can toggle between views.

### Phase 6: Summary Stats Component

**File: `src/components/ui/citywide-summary.tsx`** (NEW)

A simple header bar showing:
- Total neighborhoods analyzed
- Number showing signs of access gaps (score >= 50 is a reasonable threshold)
- Optional: city average score

Text: "We analyzed **{X}** San Diego neighborhoods. **{Y}** show signs of potential service access gaps."

This is computed client-side from the ranking data — no additional endpoint needed.

## Edge Cases & Design Decisions

### Community Name Normalization

The backend stores community names in UPPERCASE (e.g., "MIRA MESA"), the `COMMUNITIES` list uses title case ("Mira Mesa"), and the GeoJSON uses `cpname` with its own casing. A canonical mapping is needed:
- **Match strategy**: Uppercase both sides for joining score data to GeoJSON features
- **Display**: Use the `COMMUNITIES` title-case form for display
- **Slug generation**: Use `toSlug()` from `src/utils/slug.ts` on the title-case form
- Reuse the `norm()` function from `san-diego-map.tsx:221` for fuzzy matching

### Communities With No Score

`computeAllScores` skips communities with fewer than 2 signals (line 256). These communities will have GeoJSON boundaries but no ranking entry.
- **Choropleth**: Render unscored polygons with a neutral gray fill (`#e5e7eb`) and dashed border
- **Ranked list**: Omit unscored communities from the main ranking
- **Summary**: Mention in summary text: "Data unavailable for Z communities"

### Gap Threshold

The summary stat "Y show signs of potential service access gaps" needs a threshold. Decision: **score >= 50** (midpoint of 0-100 scale). This is a relative ranking, so roughly half of scored communities will qualify — which is appropriate for highlighting comparative gaps.

### i18n

All new UI strings (summary text, column headers, factor labels, loading/error messages) must use the `t()` function from `src/i18n/context.tsx`. New translation keys needed across 6 languages. English-only is acceptable for initial implementation; translations can be added incrementally.

### COMMUNITIES List Count

The `COMMUNITIES` array has 49 entries (not 50 as the issue spec states). The gap analysis may produce scores for communities not in this list (if they appear in 311/census/transit data). The citywide view should display whatever the ranking endpoint returns, not be limited to the hardcoded list.

## System-Wide Impact

- **Interaction graph**: New route `/citywide` → fetches from existing `GET /api/access-gap/ranking` (enhanced) + `GET /api/locations/neighborhoods` → renders choropleth + list → click navigates to existing `/neighborhood/:slug` route
- **Error propagation**: If ranking endpoint fails → show error state with retry. If GeoJSON fails → show ranked list only (graceful degradation). No new error types introduced.
- **State lifecycle risks**: No persistent state changes. All data is read-only from cached server responses. No risk of orphaned state.
- **API surface parity**: The ranking endpoint enhancement (returning all communities + topFactors) is additive — existing consumers still work with the same response shape.
- **Integration test scenarios**:
  1. Load citywide page → verify all communities appear in both map and list
  2. Click community in map → verify navigation to correct neighborhood detail page
  3. Resize to mobile → verify layout stacks correctly
  4. Scores cache expires → verify re-computation completes within 3 seconds

## Acceptance Criteria

### Functional Requirements

- [x] **Choropleth map** renders all community planning areas shaded by access gap score
- [x] **Color scale** is intuitive: darker/warmer = higher gap = more underserved
- [x] **Ranked list** shows all communities sorted by score (highest first)
- [x] Each list row shows: rank, community name, score, and top contributing factors
- [x] **Click-through** from map polygon or list row navigates to `/neighborhood/{slug}`
- [x] **Hover interaction**: hovering map polygon highlights list row (and vice versa)
- [x] **Summary stats** at top: "We analyzed X neighborhoods. Y show signs of potential service access gaps."
- [x] **Citywide view link** accessible from welcome page
- [x] **Back navigation** from neighborhood page to citywide view
- [x] **New route** at `/citywide`

### Non-Functional Requirements

- [x] Loads within 2-3 seconds (pre-computed scores, cached GeoJSON)
- [x] Responsive: works on mobile (stacked layout) and desktop (side-by-side)
- [x] Accessible: map has aria-label, list items are keyboard-navigable, color scale has text alternatives
- [x] No new dependencies required (Leaflet GeoJSON + Tailwind are sufficient)

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| Community boundary GeoJSON from seshat.datasd.org | External dependency, could be slow or down | Already cached server-side for 24h; GeoJSON is ~500KB, loads fast |
| Community name matching (GeoJSON `cpname` vs ranking `community`) | Names may not match exactly (case, punctuation) | Use same `norm()` fuzzy-matching function from `san-diego-map.tsx:221` |
| Access gap score computation for all 50 communities | First load after cache expiry takes ~5-10s | Scores are cached 24h; consider pre-warming cache on server start |
| Leaflet rendering 50+ polygons | Performance concern | `preferCanvas: true` + simple styles keep rendering fast |

## Implementation Order

1. **Backend**: Enhance ranking endpoint to return all communities + topFactors field
2. **Frontend API**: Add `getCitywideGaps()` client function
3. **Choropleth component**: `citywide-choropleth.tsx` with GeoJSON + color scale
4. **Ranked list component**: `citywide-ranking.tsx` with hover interaction
5. **Summary stats component**: `citywide-summary.tsx`
6. **Page assembly**: `citywide-page.tsx` — wire up data fetching, layout, loading/error states
7. **Routing**: Add `/citywide` route, welcome page link, back navigation
8. **Polish**: Mobile layout, hover sync between map and list, accessibility

## New Files

| File | Purpose |
|---|---|
| `src/pages/citywide-page.tsx` | Main citywide comparison page |
| `src/components/map/citywide-choropleth.tsx` | Leaflet choropleth map component |
| `src/components/ui/citywide-ranking.tsx` | Ranked community list component |
| `src/components/ui/citywide-summary.tsx` | Summary stats header bar |

## Modified Files

| File | Change |
|---|---|
| `server/routes/gap-analysis.ts` | Return all communities when `limit=0`, add `topFactors` field |
| `server/services/gap-analysis.ts` | Add `describeTopFactors()` helper, export full ranked list |
| `src/api/client.ts` | Add `getCitywideGaps()` function |
| `src/main.tsx` | Add `/citywide` route |
| `src/pages/welcome-page.tsx` | Add citywide view shortcut card |
| `src/pages/neighborhood-page.tsx` | Add "Back to citywide view" link |
| `src/types/index.ts` | Add `CitywideCommunity` interface |

## Sources & References

### Internal References

- Access gap scoring: `server/services/gap-analysis.ts:165` (`computeAllScores`)
- Ranking endpoint: `server/routes/gap-analysis.ts:42`
- Boundary GeoJSON fetching: `server/services/gap-analysis.ts:74`
- Community name normalization: `src/components/map/san-diego-map.tsx:221` (`norm()`)
- Frontend API client: `src/api/client.ts:51` (`getAccessGapRanking`)
- Neighborhood selector communities list: `src/components/ui/neighborhood-selector.tsx`
- Existing map component: `src/components/map/san-diego-map.tsx`

### Related Work

- GitHub Issue: makyrie/block-report#1
- Upstream Issue: bookchiq/block-report#22
