---
title: "feat: Add choropleth/heatmap layer showing access gap scores by neighborhood"
type: feat
status: active
date: 2026-03-20
---

# feat: Add Choropleth/Heatmap Layer Showing Access Gap Scores by Neighborhood

## Overview

Add a color-coded choropleth overlay to the Leaflet map that visualizes access gap scores (0-100) by neighborhood. The backend already computes and serves these scores via `/api/access-gap/ranking`. The frontend needs to fetch all scores, color-code the existing GeoJSON neighborhood boundary polygons, add a toggle control, and render a legend explaining the color scale.

This is the one remaining core workplan item from Phase 2 (Person B) — see `docs/plans/block-report-workplan.md`.

## Problem Statement / Motivation

Users currently have no way to see at a glance which San Diego neighborhoods are underserved. The access gap scores exist in the backend and are shown per-community in the sidebar, but there is no spatial visualization. A choropleth layer transforms the map from a point-based view (markers) into an area-based view that immediately communicates which neighborhoods need the most attention — the core value proposition of Block Report.

## Proposed Solution

Render all ~51 community planning district boundaries as filled GeoJSON polygons, colored on a green → yellow → red gradient based on their access gap score. Provide a toggle so users can switch between the plain map view and the choropleth view. Add a legend explaining the color scale.

## Technical Approach

### Architecture

The data flow is straightforward — one minor backend fix needed (raise ranking limit cap):

```
Frontend mount → getAccessGapRanking(100) → Map<communityName, score>
                                                    ↓
GeoJSON feature.properties.cpname → lookup score → scoreToColor() → fillColor
```

### Key Files to Modify

| File | Change |
|------|--------|
| `server/routes/gap-analysis.ts` | Raise ranking limit cap from 50 → 100 (line ~43) |
| `src/pages/neighborhood-page.tsx` | Add state for access gap scores map + layer toggle; fetch scores on mount |
| `src/components/map/san-diego-map.tsx` | Add choropleth GeoJSON layer with dynamic styling; add toggle control; add color legend |
| `src/api/client.ts` | No changes — `getAccessGapRanking()` already exists |

### Implementation Phases

#### Phase 0: Backend Fix — Raise Ranking Limit (gap-analysis.ts)

The `/api/access-gap/ranking` endpoint caps results at 50 via `Math.min(Number(limit) || 10, 50)`. Since ~51 communities exist, this silently excludes 1 community. Raise the cap to 100.

```typescript
// server/routes/gap-analysis.ts line ~43
// BEFORE: const limit = Math.min(Number(_req.query.limit) || 10, 50);
// AFTER:
const limit = Math.min(Number(_req.query.limit) || 10, 100);
```

**Acceptance criteria:**
- [ ] Ranking endpoint allows `limit` up to 100
- [ ] `getAccessGapRanking(100)` returns all ~51 communities

#### Phase 1: Data Fetching & State (neighborhood-page.tsx)

Add state and fetch logic in the parent page component:

```typescript
// neighborhood-page.tsx
const [accessGapScores, setAccessGapScores] = useState<Map<string, number>>(new Map());
const [showChoropleth, setShowChoropleth] = useState(false);

useEffect(() => {
  getAccessGapRanking(100).then(({ ranking }) => {
    const scoreMap = new Map<string, number>();
    for (const r of ranking) {
      scoreMap.set(r.community.toUpperCase().trim(), r.accessGapScore);
    }
    setAccessGapScores(scoreMap);
  });
}, []);
```

Pass new props to `SanDiegoMap`:

```typescript
<SanDiegoMap
  // ...existing props
  accessGapScores={accessGapScores}
  showChoropleth={showChoropleth}
  onToggleChoropleth={() => setShowChoropleth(prev => !prev)}
/>
```

**Acceptance criteria:**
- [ ] Scores fetched once on mount, stored as `Map<string, number>` keyed by uppercase community name
- [ ] Toggle state managed in parent, passed down to map

#### Phase 2: Choropleth Layer Rendering (san-diego-map.tsx)

Add a GeoJSON layer that renders all neighborhood boundaries with score-based fill colors:

```typescript
// Color utility — no external dependency needed
function scoreToColor(score: number | null): string {
  if (score === null) return '#d1d5db'; // gray-300 for missing data
  // Green (0) → Yellow (50) → Red (100)
  const t = score / 100;
  if (t <= 0.5) {
    // Green to Yellow
    const r = Math.round(255 * (t * 2));
    return `rgb(${r}, 200, 50)`;
  } else {
    // Yellow to Red
    const g = Math.round(200 * (1 - (t - 0.5) * 2));
    return `rgb(255, ${g}, 50)`;
  }
}

// Inside SanDiegoMap component
{showChoropleth && neighborhoodBoundaries && (
  <GeoJSON
    key="choropleth"
    data={neighborhoodBoundaries}
    style={(feature) => {
      const name = (feature?.properties?.cpname || '').toUpperCase().trim();
      const score = accessGapScores.get(name) ?? null;
      return {
        fillColor: scoreToColor(score),
        color: '#666',
        weight: 1.5,
        opacity: 0.8,
        fillOpacity: 0.6,
      };
    }}
    onEachFeature={(feature, layer) => {
      const name = feature.properties?.cpname || 'Unknown';
      const score = accessGapScores.get(name.toUpperCase().trim());
      layer.bindTooltip(
        `${name}: ${score !== undefined ? score + '/100' : 'No data'}`,
        { sticky: true }
      );
      layer.on('click', () => onCommunitySelect?.(name));
    }}
  />
)}
```

**Acceptance criteria:**
- [ ] All ~51 community boundaries rendered as filled polygons when choropleth is active
- [ ] Color gradient: green (score 0, well-served) → yellow (50) → red (100, underserved)
- [ ] Communities without score data shown in gray (#d1d5db)
- [ ] Hover tooltip shows community name and score (e.g. "Mira Mesa: 42/100")
- [ ] Click on a polygon selects that community (triggers `onCommunitySelect`)
- [ ] Choropleth layer renders below markers (libraries, rec centers, transit stops)

#### Phase 3: Toggle Control

Add a simple toggle button to the map. Use Leaflet's control positioning or a custom overlay:

```typescript
// Custom control component using React Leaflet
function ChoroplethToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <div className="leaflet-top leaflet-right" style={{ pointerEvents: 'auto' }}>
      <div className="leaflet-control leaflet-bar bg-white px-3 py-2 cursor-pointer shadow-md"
           onClick={onToggle}>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={active} readOnly className="accent-amber-600" />
          Access Gap Layer
        </label>
      </div>
    </div>
  );
}
```

**Acceptance criteria:**
- [ ] Toggle control visible in map's top-right corner
- [ ] Clicking toggles choropleth on/off
- [ ] Toggle label: "Access Gap Layer"
- [ ] Default state: off (plain map view)

#### Phase 4: Legend

Add a color-scale legend to the map (bottom-right or extend existing bottom-left legend):

```typescript
// Legend component
function ChoroplethLegend() {
  const grades = [0, 20, 40, 60, 80, 100];
  return (
    <div className="leaflet-bottom leaflet-right">
      <div className="leaflet-control bg-white p-3 rounded shadow-md text-xs">
        <div className="font-semibold mb-1">Access Gap Score</div>
        {grades.map((grade, i) => (
          <div key={grade} className="flex items-center gap-1">
            <span
              className="inline-block w-4 h-4 rounded-sm border border-gray-300"
              style={{ backgroundColor: scoreToColor(grade) }}
            />
            <span>{grade}{i < grades.length - 1 ? `–${grades[i + 1]}` : '+'}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 mt-1">
          <span className="inline-block w-4 h-4 rounded-sm border border-gray-300 bg-gray-300" />
          <span>No data</span>
        </div>
      </div>
    </div>
  );
}
```

**Acceptance criteria:**
- [ ] Legend shows color gradient with score ranges (0-20, 20-40, ..., 80-100)
- [ ] Legend includes "No data" entry with gray swatch
- [ ] Legend only visible when choropleth is active
- [ ] Legend positioned bottom-right (does not overlap existing bottom-left legend)

## Edge Cases & Considerations

### Click Event Propagation

The map has a `MapClickHandler` for the "pin your block" feature. Clicking a choropleth polygon must NOT also trigger block-pinning. Polygon click handlers should call `L.DomEvent.stopPropagation(e)` so clicks don't bubble to the map click handler.

### Community Name Matching

The GeoJSON `cpname` property and API `community` field use different casing. Both sides normalize to uppercase with `.toUpperCase().trim()` before lookup. The backend already normalizes this way in `gap-analysis.ts:41,98`.

### Interaction with Selected Community Highlight

When a community is selected, the existing code renders a single highlighted boundary (blue fill at 12% opacity). When the choropleth is active:
- The selected community should retain its choropleth fill color (to preserve score info) but get a thick dark border (3-4px, `#1e3a5f`) and slightly increased opacity to distinguish it
- The existing selected-community `<GeoJSON>` layer renders on top of the choropleth layer
- Both layers can coexist — the selected highlight overlays on top

### Loading State

Access gap scores are fetched asynchronously. While loading:
- The toggle control should be disabled or hidden until scores are available
- If the user enables choropleth before scores load, boundaries render in gray (no data) then update when scores arrive — this is handled naturally by React re-render

### Performance

~51 GeoJSON features is lightweight for Leaflet. No performance concerns. The `key="choropleth"` prop ensures React Leaflet re-creates the layer when toggled rather than trying to diff styles.

### Mobile / Touch

- Tooltips use `sticky: true` so they follow the cursor on desktop
- On mobile, tooltips show on tap — Leaflet handles this natively
- Toggle control is touch-friendly with adequate tap target size

### Print View

The choropleth layer does not need to appear in print — the print layout shows the flyer component, not the map (see `src/print.css`). No print-specific changes needed.

### Accessibility

- Color-blind users: The green-yellow-red gradient is not ideal for color-blind users, but the tooltips provide the numeric score as a fallback. The legend also shows numeric ranges.
- Screen readers: The toggle checkbox has a visible label ("Access Gap Layer"). Tooltips provide text alternatives for colors.

## System-Wide Impact

- **Interaction graph:** Toggle state change → React re-render → GeoJSON layer mount/unmount. Click on choropleth polygon → calls existing `onCommunitySelect` handler → loads sidebar data. No new side effects.
- **Error propagation:** If `getAccessGapRanking()` fails, the `accessGapScores` map stays empty. All boundaries render gray. No crash — graceful degradation.
- **State lifecycle risks:** None. The scores map is read-only after fetch. Toggle is a simple boolean. No persistent state, no server mutations.
- **API surface parity:** The `/api/access-gap/ranking` endpoint already exists and is used by the sidebar. No new endpoints needed.

## Acceptance Criteria

### Functional Requirements

- [ ] Choropleth layer renders all ~51 community boundaries with fill colors based on access gap score
- [ ] Color scale: green (0, well-served) → yellow (50) → red (100, underserved)
- [ ] Toggle control in top-right corner to show/hide the choropleth layer
- [ ] Legend in bottom-right showing color scale and "No data" entry
- [ ] Hover tooltip shows community name and score
- [ ] Click on choropleth polygon selects that community
- [ ] Communities without scores shown in gray
- [ ] Choropleth layer renders below point markers

### Non-Functional Requirements

- [ ] No new npm dependencies required
- [ ] No new API endpoints required
- [ ] Works on mobile (touch interactions for tooltips)

## Dependencies & Risks

| Dependency | Status | Risk |
|-----------|--------|------|
| `/api/access-gap/ranking` endpoint | Exists | None |
| `getAccessGapRanking()` client function | Exists | None |
| Neighborhood boundaries GeoJSON | Fetched on mount | None |
| Leaflet GeoJSON styling API | Built-in | None |

**Risk:** Community name mismatch between GeoJSON and API response. **Mitigation:** Both normalize to uppercase — verified in existing code.

## Sources & References

### Internal References

- Access gap scoring: `server/services/gap-analysis.ts:165-279`
- API endpoint: `server/routes/gap-analysis.ts`
- Frontend client: `src/api/client.ts` — `getAccessGapRanking()`
- Map component: `src/components/map/san-diego-map.tsx`
- Parent page: `src/pages/neighborhood-page.tsx`
- Workplan reference: `docs/plans/block-report-workplan.md` (Phase 2, Person B)

### Related Work

- Upstream issue: bookchiq/block-report#49
- GitHub issue: makyrie/block-report#5
