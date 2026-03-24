---
title: "Historical 311 Trends Pipeline — Race Conditions, Validation Gaps, and Cache Management"
date: 2026-03-20
issue_id: 9
problem_type: integration_issue
component:
  - server/routes/metrics.ts
  - server/services/claude.ts
  - src/hooks/use-report.ts
symptoms:
  - Reports generated without trends data due to async race condition
  - Claude API responses cast without runtime validation
  - Unbounded in-memory cache growing without eviction
  - Stale fetch responses overwriting fresh data on rapid user interaction
  - SQL NULL propagation hiding valid status changes
  - Duplicated report generation logic masking bugs across pages
tags:
  - race-condition
  - async-state
  - cache-management
  - runtime-validation
  - input-sanitization
  - sql-null-safety
  - abort-controller
  - custom-hooks
  - data-pipeline
severity: P1
---

# Historical 311 Trends Pipeline — Integration Learnings

## Problem Summary

Issue #9 added a historical 311 trends feature: a SQL function computing monthly aggregates, a new `/api/311/trends` endpoint, frontend sparkline/trend-indicator components, and integration with Claude report generation. The initial implementation was functionally correct but code review revealed **12 issues (2 P1, 7 P2, 3 P3)** spanning race conditions, validation gaps, cache management, and architectural concerns.

The core lesson: **wiring a new async data source into an existing pipeline exposes integration seams** — timing assumptions, validation boundaries, and state management patterns that worked with fewer data sources break when a new one is added.

---

## Root Cause Analysis

### P1: Report Generation Race Condition

The report generation effect depended on `metrics` but not on trends being settled. When metrics arrived first, the effect fired immediately and generated a report without trends context — even though trends data was visible in the sidebar moments later.

```typescript
// ✗ Problem: no gate on trends readiness
useEffect(() => {
  if (!metrics) return;
  generateReport(buildProfile(metrics)); // trends not included
}, [metrics]); // trends not in deps
```

### P1: No Runtime Validation on Claude Response

Claude's tool-use response (`toolBlock.input`, typed `unknown`) was cast directly to `CommunityReport`. A malformed response (missing fields, wrong types) would propagate to the frontend and crash on `.map()` calls.

```typescript
// ✗ Problem: trust without verify
const report = toolBlock.input as CommunityReport;
```

### P2: Unbounded In-Memory Cache

The trends cache (`Map<string, CacheEntry>`) had TTL-based eviction on read but no size cap and no proactive sweep. In a long-running server with many communities, memory grew without bound.

### P2: Missing AbortController

Block data fetches and flyer-page data fetches had no cancellation mechanism. Rapid community changes or map clicks caused stale responses to overwrite fresh state.

### P2: Duplicated State Machine

Nearly identical report generation logic existed in `neighborhood-page.tsx` and `flyer-page.tsx`. Bugs fixed in one location weren't automatically fixed in the other.

---

## Solution

### 1. Explicit "Settled" Synchronization

Track when async operations *settle* (resolve or reject), not just when data loads. Block downstream effects until all dependencies have settled.

```typescript
// ✓ trendsSettled fires on both success and failure
get311Trends(community, signal)
  .then(setTrends)
  .catch(() => {}) // failure is still "settled"
  .finally(() => { if (!signal.aborted) setTrendsSettled(true); });

// useReport hook: wait for ALL data to settle
if (!metrics || !trendsSettled) {
  setReportLoading(false);
  return; // effect re-runs when trendsSettled changes
}
```

### 2. Runtime Validation at External Boundaries

Validate Claude API responses before passing to consumers. Throw descriptive errors for each failure mode.

```typescript
function validateReportInput(input: unknown): Omit<CommunityReport, 'generatedAt'> {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Claude returned non-object tool input');
  }
  const obj = input as Record<string, unknown>;

  for (const field of ['neighborhoodName', 'language', 'summary']) {
    const val = obj[field];
    if (typeof val !== 'string' || val.trim().length === 0) {
      throw new Error(`Claude response missing or invalid field: ${field}`);
    }
  }

  for (const field of ['goodNews', 'topIssues', 'howToParticipate']) {
    const val = obj[field];
    if (!Array.isArray(val) || val.length === 0) {
      throw new Error(`Claude response missing or empty array: ${field}`);
    }
    if (!val.every((item) => typeof item === 'string')) {
      throw new Error(`Claude response field ${field} contains non-string items`);
    }
  }

  // Also validates contactInfo nested object (councilDistrict, phone311, anchorLocation)
  // See server/services/claude.ts for full implementation

  return input as Omit<CommunityReport, 'generatedAt'>;
}
```

### 3. Bounded Cache with Periodic Sweep

Cap cache size on insertion. Add periodic sweep to proactively remove stale entries.

```typescript
const TRENDS_MAX_SIZE = 100;
const TRENDS_TTL = 24 * 60 * 60 * 1000;

// On insert: evict oldest if at capacity
if (trendsCache.size >= TRENDS_MAX_SIZE) {
  const oldestKey = trendsCache.keys().next().value;
  if (oldestKey !== undefined) trendsCache.delete(oldestKey);
}
trendsCache.set(key, { data, cachedAt: Date.now() });

// Periodic sweep: .unref() so interval doesn't keep process alive
setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of trendsCache) {
    if (now - entry.cachedAt >= TRENDS_TTL) trendsCache.delete(k);
  }
}, 60 * 60 * 1000).unref();
```

### 4. AbortController on All Fetch Effects

Every effect that fetches data must create an AbortController, pass its signal, check `signal.aborted` in all branches, and abort on cleanup.

```typescript
useEffect(() => {
  const controller = new AbortController();
  const { signal } = controller;

  fetchData(url, signal)
    .then(data => { if (!signal.aborted) setState(data); })
    .catch(err => { if (!signal.aborted) console.error(err); })
    .finally(() => { if (!signal.aborted) setLoading(false); });

  return () => controller.abort();
}, [dependency]);
```

### 5. Custom Hook Extraction

Extract duplicated async state machines to a custom hook. Single source of truth means bug fixes apply everywhere.

The `useReport` hook consolidated report generation from both `neighborhood-page.tsx` and `flyer-page.tsx`, eliminating the duplicated race condition logic.

### 6. NULL-Safe SQL

Handle all edge cases in SQL CASE statements — missing current data, missing previous data, both missing.

```sql
-- Note: "declining" means more complaints = worsening conditions (civic semantics)
volumeDirection: CASE
  WHEN h.prev_vol IS NULL OR h.prev_vol = 0 THEN 'stable'
  WHEN ((h.curr_vol - h.prev_vol)::numeric / h.prev_vol::numeric) * 100 > 10 THEN 'declining'
  WHEN ((h.curr_vol - h.prev_vol)::numeric / h.prev_vol::numeric) * 100 < -10 THEN 'improving'
  ELSE 'stable'
END
```

### 7. Input Validation with Allowlists

Validate community names against an allowlist. Strip SQL wildcards. Enforce length limits. Validate language parameters.

```typescript
export const COMMUNITIES_LOWER = new Set(COMMUNITIES.map(c => c.toLowerCase()));

export function validateCommunity(req, res): string | null {
  const community = req.query.community as string | undefined;
  if (!community) { res.status(400).json({ error: 'required' }); return null; }
  const cleaned = community.replace(/[%_]/g, '');
  if (!COMMUNITIES_LOWER.has(cleaned.toLowerCase())) {
    res.status(400).json({ error: 'Unknown community' });
    return null;
  }
  return cleaned;
}
```

---

## Prevention Checklist

Use before submitting features that add new data sources or async pipelines:

- [ ] Every effect has AbortController with signal checks in all branches
- [ ] Downstream effects gate on all upstream data being "settled" (not just loaded)
- [ ] External API responses validated at the boundary before casting
- [ ] In-memory caches have max-size cap AND periodic sweep
- [ ] User inputs validated against allowlists at route handlers
- [ ] SQL CASE statements handle all NULL combinations
- [ ] No duplicated async state machines — extract to custom hooks
- [ ] Critical path (new feature's primary endpoint) has test coverage
- [ ] No `as any` casts on external data

---

## Known Remaining Issues

Issues identified during documentation review that were not fully addressed:

- **Incomplete abort guards**: Some `.then()` handlers (e.g., `.then(setMetrics)`) do not check `signal.aborted` before calling state setters, despite AbortController being present. The pattern should be `.then(data => { if (!signal.aborted) setMetrics(data); })` in all branches.
- **`regenerate` callback lacks cancellation**: The `useReport` hook's `regenerate` function does not use an AbortController, so a stale generation could still set state if the user changes community mid-generation.

---

## Related Files

- `server/utils/validation.ts` — allowlist validation pattern
- `src/hooks/use-report.ts` — custom hook for shared report generation
- `server/services/claude.ts` — runtime validation of Claude response
- `server/routes/metrics.ts` — bounded cache with periodic sweep
- `prisma/functions/get_community_trends.sql` — NULL-safe SQL aggregation
- `plans/issue-9.md` — original implementation plan
