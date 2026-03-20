---
title: "feat: Historical 311 Trends Per Neighborhood"
type: feat
status: active
date: 2026-03-20
---

# feat: Historical 311 Trends Per Neighborhood

## Overview

Add historical 311 trend data so users can see whether resolution rates and request volumes are improving or declining over time for each neighborhood. Currently the app shows only a point-in-time snapshot. Trends add context like "Resolution rate improved from 62% to 78% over the past year."

## Problem Statement / Motivation

The current `/api/311` endpoint returns aggregate metrics (total requests, resolution rate, avg days to resolve) with no time dimension. A neighborhood could have a 70% resolution rate — but is that up from 50% or down from 90%? Without trend context, the data tells an incomplete story.

Historical trends enable:
- **Civic accountability:** residents can see if the city is improving service delivery in their area
- **Narrative richness:** the Claude-generated report can reference trajectory ("improving" vs "declining")
- **Comparative insight:** a low absolute number paired with a positive trend tells a different story than a high number with decline

## Proposed Solution

Add a new SQL function, API endpoint, TypeScript types, and frontend visualization that delivers monthly 311 trend data for the trailing 12 months per community.

### Architecture

```
GET /api/311/trends?community={name}
    ↓
Express route (server/routes/metrics.ts)
    ↓
Prisma raw SQL → get_community_trends(community_name)
    ↓
PostgreSQL aggregates requests_311 by month
    ↓
Returns JSON array of monthly data points
    ↓
Frontend renders sparklines + trend indicators in sidebar
    ↓
Pre-computed trend summary fed into Claude report prompt
```

## Technical Approach

### Phase 1: Backend — SQL Function & API Endpoint

#### 1a. New SQL function: `get_community_trends()`

Create `prisma/functions/get_community_trends.sql`:

```sql
CREATE OR REPLACE FUNCTION get_community_trends(community_name TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  cleaned TEXT;
BEGIN
  cleaned := replace(replace(community_name, '%', ''), '_', '');

  SELECT jsonb_build_object(
    'monthly', COALESCE(monthly.items, '[]'::jsonb),
    'summary', jsonb_build_object(
      'currentResolutionRate', COALESCE(curr.rate, 0),
      'previousResolutionRate', COALESCE(prev.rate, 0),
      'direction', CASE
        WHEN curr.rate > prev.rate + 0.05 THEN 'improving'
        WHEN curr.rate < prev.rate - 0.05 THEN 'declining'
        ELSE 'stable'
      END,
      'volumeChange', CASE
        WHEN prev.vol > 0 THEN ROUND(((curr.vol - prev.vol)::numeric / prev.vol::numeric) * 100)
        ELSE 0
      END
    )
  ) INTO result
  FROM
    -- Monthly aggregation for trailing 12 complete months
    LATERAL (
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.period) AS items FROM (
        SELECT
          to_char(date_trunc('month', date_requested), 'YYYY-MM') AS period,
          COUNT(*) AS total_requests,
          COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL) AS resolved_count,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
            / NULLIF(COUNT(*), 0)::numeric, 3
          ) AS resolution_rate,
          ROUND(AVG(EXTRACT(EPOCH FROM (date_closed - date_requested)) / 86400)
            FILTER (WHERE date_closed IS NOT NULL AND date_requested IS NOT NULL
                    AND date_closed >= date_requested)::numeric, 1
          ) AS avg_days_to_resolve
        FROM requests_311
        WHERE LOWER(comm_plan_name) = LOWER(cleaned)
          AND date_requested >= date_trunc('month', NOW()) - INTERVAL '12 months'
          AND date_requested < date_trunc('month', NOW()) -- exclude current incomplete month
        GROUP BY date_trunc('month', date_requested)
        ORDER BY date_trunc('month', date_requested)
      ) t
    ) monthly,
    -- Current 6-month window resolution rate
    LATERAL (
      SELECT
        ROUND(COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
          / NULLIF(COUNT(*), 0)::numeric, 3) AS rate,
        COUNT(*) AS vol
      FROM requests_311
      WHERE LOWER(comm_plan_name) = LOWER(cleaned)
        AND date_requested >= date_trunc('month', NOW()) - INTERVAL '6 months'
        AND date_requested < date_trunc('month', NOW())
    ) curr,
    -- Previous 6-month window resolution rate
    LATERAL (
      SELECT
        ROUND(COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
          / NULLIF(COUNT(*), 0)::numeric, 3) AS rate,
        COUNT(*) AS vol
      FROM requests_311
      WHERE LOWER(comm_plan_name) = LOWER(cleaned)
        AND date_requested >= date_trunc('month', NOW()) - INTERVAL '12 months'
        AND date_requested < date_trunc('month', NOW()) - INTERVAL '6 months'
    ) prev;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
```

Key design decisions:
- **12 months of monthly data** — enough for a meaningful sparkline without excessive payload (~12 rows)
- **Exclude current incomplete month** — avoids artificially low final data point
- **Pre-computed summary** with direction (improving/declining/stable) and volume change % — avoids sending raw data into Claude prompts
- **5% threshold for direction** — prevents noise from being classified as a trend
- **Uses same `LOWER()` normalization** as existing `get_community_metrics()`

#### 1b. New API route

Add to `server/routes/metrics.ts`:

```typescript
router.get('/trends', async (req, res) => {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  const cleaned = community.replace(/[%_]/g, '');
  if (cleaned.length > 100 || cleaned.length === 0) {
    res.status(400).json({ error: 'Invalid community name' });
    return;
  }

  try {
    const result = await prisma.$queryRaw`
      SELECT get_community_trends(${cleaned})
    `;
    res.json(result[0].get_community_trends);
  } catch (err) {
    logger.error('Failed to fetch 311 trends', { error: err.message, community });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

#### 1c. Route mounting

In `server/index.ts`, the metrics router is already mounted. Since this adds a sub-route to the same router, the new `/trends` path will be available as `GET /api/311/trends?community={name}`.

#### 1d. Database index

Add a composite index for efficient time-series queries:

```sql
CREATE INDEX CONCURRENTLY idx_311_comm_plan_date
ON requests_311 (LOWER(comm_plan_name), date_requested);
```

This supports the `WHERE LOWER(comm_plan_name) = ... AND date_requested >= ...` pattern used in the trend function.

### Phase 2: TypeScript Types & Frontend Client

#### 2a. Type definitions

Add to `src/types/index.ts`:

```typescript
export interface TrendDataPoint {
  period: string;          // "YYYY-MM" format
  totalRequests: number;
  resolvedCount: number;
  resolutionRate: number;  // 0-1
  avgDaysToResolve: number | null;
}

export interface TrendSummary {
  currentResolutionRate: number;
  previousResolutionRate: number;
  direction: 'improving' | 'declining' | 'stable';
  volumeChange: number;   // percentage change
}

export interface CommunityTrends {
  monthly: TrendDataPoint[];
  summary: TrendSummary;
}
```

#### 2b. Frontend API client

Add to `src/api/client.ts`:

```typescript
export function get311Trends(community: string): Promise<CommunityTrends> {
  return fetchJSON(`${BASE}/311/trends?community=${encodeURIComponent(community)}`);
}
```

### Phase 3: Frontend — Sidebar Trend Display

#### 3a. Sparkline component

Create `src/components/ui/sparkline.tsx` — a lightweight inline SVG sparkline with no external dependencies:

```typescript
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export default function Sparkline({ data, width = 80, height = 24, color = '#3b82f6', className }: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

Key decisions:
- **No charting library dependency** — per CLAUDE.md, avoid adding libraries when a simple solution works
- **SVG-based** — renders cleanly in both screen and print contexts
- **`aria-hidden`** — sparklines are decorative; the trend direction is communicated via text

#### 3b. Trend indicator component

Create `src/components/ui/trend-indicator.tsx`:

```typescript
interface TrendIndicatorProps {
  direction: 'improving' | 'declining' | 'stable';
  label: string;  // e.g., "Resolution rate"
  sparklineData?: number[];
}

export default function TrendIndicator({ direction, label, sparklineData }: TrendIndicatorProps) {
  const config = {
    improving: { arrow: '↑', color: 'text-green-600', bg: 'bg-green-50', sparkColor: '#16a34a' },
    declining: { arrow: '↓', color: 'text-red-600', bg: 'bg-red-50', sparkColor: '#dc2626' },
    stable:    { arrow: '→', color: 'text-gray-600', bg: 'bg-gray-50', sparkColor: '#6b7280' },
  };
  const c = config[direction];

  return (
    <div className={`flex items-center gap-2 rounded px-2 py-1 ${c.bg}`}>
      <span className={`text-sm font-medium ${c.color}`}>{c.arrow}</span>
      {sparklineData && <Sparkline data={sparklineData} color={c.sparkColor} />}
      <span className="text-xs text-gray-600">{label}: <span className={c.color}>{direction}</span></span>
    </div>
  );
}
```

#### 3c. Sidebar integration

Add a "Trends" section in `src/components/ui/sidebar.tsx` between the summary badges and the "Good News" section:

```typescript
{/* Historical trends */}
{trends && trends.monthly.length >= 3 && (
  <section aria-labelledby="trends-heading" className="rounded-lg bg-blue-50 border border-blue-200 p-3">
    <h2 id="trends-heading" className="text-sm font-medium text-blue-800 mb-2">
      12-Month Trends
    </h2>
    <TrendIndicator
      direction={trends.summary.direction}
      label="Resolution rate"
      sparklineData={trends.monthly.map(d => d.resolutionRate)}
    />
    <div className="mt-1.5">
      <TrendIndicator
        direction={trends.summary.volumeChange > 10 ? 'declining' : trends.summary.volumeChange < -10 ? 'improving' : 'stable'}
        label="Request volume"
        sparklineData={trends.monthly.map(d => d.totalRequests)}
      />
    </div>
    <p className="text-xs text-blue-600 mt-2">
      Resolution rate: {Math.round(trends.summary.previousResolutionRate * 100)}%
      → {Math.round(trends.summary.currentResolutionRate * 100)}%
    </p>
  </section>
)}
```

**Loading behavior:** Trends load asynchronously after the main metrics load. The sidebar renders immediately with current metrics; the trends section appears when ready. No additional loading spinner — the section simply doesn't render until data arrives.

**Minimum data threshold:** Only show trends when at least 3 monthly data points exist, to avoid misleading sparklines.

### Phase 4: Report Generation Integration

#### 4a. Extend the NeighborhoodProfile for report generation

The `NeighborhoodProfile` interface gets an optional `trends` field:

```typescript
export interface NeighborhoodProfile {
  // ... existing fields ...
  trends?: CommunityTrends;
}
```

#### 4b. Claude prompt integration

In `server/services/claude.ts`, when trend data is present in the profile, include only the pre-computed summary — not raw monthly data — to minimize token usage:

```typescript
// Add to the prompt context, not the raw data
const trendContext = profile.trends?.summary
  ? `311 Trend: Resolution rate is ${profile.trends.summary.direction} ` +
    `(${Math.round(profile.trends.summary.previousResolutionRate * 100)}% → ` +
    `${Math.round(profile.trends.summary.currentResolutionRate * 100)}%). ` +
    `Request volume changed ${profile.trends.summary.volumeChange}% vs prior period.`
  : '';
```

This adds ~30 tokens to the prompt, not hundreds.

### Phase 5: Flyer Layout Integration

In `src/components/flyer/flyer-layout.tsx`, add small trend arrows next to the "big number cards" (Total Issues, % Resolved, Avg Days to Fix):

```typescript
// Next to the resolution rate card
{trends?.summary && (
  <span className={`text-sm ${
    trends.summary.direction === 'improving' ? 'text-green-600' :
    trends.summary.direction === 'declining' ? 'text-red-600' : 'text-gray-500'
  }`}>
    {trends.summary.direction === 'improving' ? '↑' :
     trends.summary.direction === 'declining' ? '↓' : '→'}
  </span>
)}
```

Keep flyer changes minimal — a directional arrow, not a full sparkline — to preserve the one-page print layout.

## System-Wide Impact

- **Interaction graph:** User selects neighborhood → `App.tsx` calls `get311Trends()` in parallel with existing `get311()` → trends state stored alongside metrics → passed as prop to Sidebar and FlyerLayout → optionally included in profile sent to `/api/report/generate`
- **Error propagation:** If the trends endpoint fails, the sidebar still renders with current metrics (trends section simply doesn't appear). No cascading failure.
- **State lifecycle risks:** Trend data is read-only and stateless. No risk of partial writes or stale caches beyond the existing 24h pattern.
- **API surface parity:** The new `/api/311/trends` endpoint follows the same pattern as `/api/311` (same validation, same error format, same caching strategy).
- **Integration test scenarios:**
  1. Select a community with ample data (Mira Mesa) → verify sparkline renders with 12 data points
  2. Select a community with sparse data (<3 months) → verify trends section is hidden
  3. Generate a report with trend data → verify Claude mentions trend direction in output
  4. Print the flyer → verify trend arrows render correctly
  5. Call `/api/311/trends` with invalid community → verify 400 error response

## Acceptance Criteria

- [ ] `GET /api/311/trends?community={name}` returns monthly trend data for the trailing 12 complete months
- [ ] Response includes `monthly` array (period, totalRequests, resolvedCount, resolutionRate, avgDaysToResolve) and `summary` (direction, volumeChange, rate comparison)
- [ ] Current incomplete month is excluded from trend data
- [ ] Sidebar shows sparkline + trend indicator for resolution rate and request volume when >= 3 data points exist
- [ ] Trends section loads asynchronously — does not block initial sidebar render
- [ ] Trend summary is included in Claude report prompt (not raw monthly data)
- [ ] Flyer shows directional arrow next to resolution rate card
- [ ] Community name normalization uses `LOWER()` consistent with existing function
- [ ] Input validation matches existing `/api/311` endpoint (SQL wildcard stripping, length check)
- [ ] Endpoint returns appropriate errors (400 for missing/invalid community, 500 for server errors)
- [ ] No new charting library dependency — uses hand-rolled SVG sparklines
- [ ] Composite database index `(LOWER(comm_plan_name), date_requested)` added for query performance

## Success Metrics

- Trend data loads in <500ms for a community with full 12-month data
- Sidebar sparklines render correctly for all neighborhoods that have sufficient data
- Claude reports reference trend direction when trend data is available
- No increase in initial page load time (trends load asynchronously)

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| Neon PostgreSQL access | SQL function must be deployed to the database | Include deployment SQL in `prisma/functions/` |
| Data density varies by community | Sparse communities may have noisy trends | Hide trends when <3 data points; no statistical claims |
| Sidebar space | Already dense layout | Use compact sparkline + arrow, collapsible section |
| Claude token budget | Raw trend data would waste tokens | Pre-compute summary, pass ~30 tokens not hundreds |
| Print layout | Flyer is one-page constrained | Arrow indicators only, no full sparklines on flyer |
| No composite index | Time-series query could be slow on large table | Add `idx_311_comm_plan_date` index |

## Files to Create/Modify

### New Files
- `prisma/functions/get_community_trends.sql` — SQL aggregation function
- `src/components/ui/sparkline.tsx` — Inline SVG sparkline component
- `src/components/ui/trend-indicator.tsx` — Trend direction + sparkline wrapper

### Modified Files
- `server/routes/metrics.ts` — Add `/trends` route handler
- `src/types/index.ts` — Add `TrendDataPoint`, `TrendSummary`, `CommunityTrends` interfaces; extend `NeighborhoodProfile`
- `src/api/client.ts` — Add `get311Trends()` function
- `src/components/ui/sidebar.tsx` — Add trends section with sparklines
- `src/components/flyer/flyer-layout.tsx` — Add trend arrows to big number cards
- `server/services/claude.ts` — Include trend summary in report prompt
- `src/App.tsx` — Fetch trend data alongside metrics, pass to sidebar/flyer

## Sources & References

- Upstream issue: [bookchiq/block-report#54](https://github.com/bookchiq/block-report/issues/54)
- Project workplan: `docs/plans/block-report-workplan.md` (Stretch Goals #5, line 283)
- Existing SQL function: `prisma/functions/get_community_metrics.sql`
- Existing 311 endpoint: `server/routes/metrics.ts`
- Type definitions: `src/types/index.ts`
- Sidebar display: `src/components/ui/sidebar.tsx`
- Flyer layout: `src/components/flyer/flyer-layout.tsx`
