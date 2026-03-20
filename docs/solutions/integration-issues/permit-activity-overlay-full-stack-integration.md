---
title: "Permit Activity Overlay — Full-Stack Integration Lessons"
date: "2026-03-20"
problem_type: "feature_implementation"
severity: "medium"
component: "permits-overlay"
tags:
  - permits
  - map-overlay
  - prisma
  - input-validation
  - race-condition
  - database-index
  - security
  - separation-of-concerns
  - abort-controller
  - seed-script
  - shared-popup
related_issues:
  - "makyrie/block-report#8"
  - "bookchiq/block-report#53"
symptoms:
  - "Permits endpoint accepted arbitrary community query strings with no validation"
  - "Metrics route had ad-hoc sanitizer (only stripping % and _) that differed from permits route"
  - "claude.ts imported prisma directly, bypassing the goodNews data already assembled by metrics.ts"
  - "On mount, permits were fetched for all communities with no filter — unbounded query"
  - "Permit fetch lacked AbortController — stale responses could race and overwrite newer results"
  - "No compound index on (community, date_issued) — filtered queries were full-table scans"
  - "seed.ts used $executeRawUnsafe for TRUNCATE"
  - "Permit markers each instantiated their own Popup component — thousands of DOM nodes"
  - "Frontend Permit type declared lat/lng as nullable despite backend guaranteeing non-null"
  - "No test coverage for community parameter validation logic"
root_cause: "Initial implementation followed the happy path without addressing cross-cutting concerns: input validation, race conditions, separation of concerns, database indexing, and DOM performance for large datasets"
resolution: "Iterative code review fixes across 7 commits: shared allowlist validation, AbortController cleanup, singleton popup pattern, composite database index, explicit select clauses, and proper layering"
---

# Permit Activity Overlay — Full-Stack Integration Lessons

## Context

Issue [makyrie/block-report#8](https://github.com/makyrie/block-report/issues/8) added a permit activity layer to the Block Report map, showing recent San Diego building/development permit approvals as amber `CircleMarker` components. The feature spans all three workstreams: **data** (Prisma model, seed script, REST endpoint), **map** (Leaflet markers, legend, popup), and **report** (Good News section enrichment via Claude prompt).

The initial feature commit was followed by 7 fix commits resolving issues found during code review. This document captures the lessons from that review process.

## Root Cause Analysis

### 1. Separation of Concerns — claude.ts queried the database directly

The initial implementation added a Prisma import and permit count query directly inside `server/services/claude.ts`. This violated the layering contract: service modules should receive data, not fetch it. The permit count was already computed by `metrics.ts` and included in the `goodNews` array passed through `NeighborhoodProfile`.

**Fix:** Removed the direct DB call from `claude.ts` and relied on `profile.goodNews` instead.

### 2. Unbounded Fetch — all permits loaded on mount

`getPermits()` was called without a `community` argument on component mount, loading every permit in the database (up to 5,000 rows) and rendering thousands of React elements before the user selected a neighborhood.

**Fix:** Moved the permit fetch to a separate `useEffect` that only fires when `selectedCommunity` is non-null, and clears the list when no community is selected.

### 3. Race Condition — stale data on rapid community switching

When the user switched communities quickly, in-flight fetches from the previous community could resolve after the new fetch and overwrite state with stale data.

**Fix:** Added an `AbortController` to the permit `useEffect`:

```typescript
useEffect(() => {
  if (!selectedCommunity) { setPermits([]); return; }
  const controller = new AbortController();
  getPermits(selectedCommunity, { signal: controller.signal })
    .then(setPermits)
    .catch((err) => { if (err.name !== 'AbortError') console.error(err); });
  return () => controller.abort();
}, [selectedCommunity]);
```

This required threading `RequestInit` through `getPermits()` in `src/api/client.ts` so callers could pass `{ signal }`.

### 4. Security — input validation was a denylist

The initial validation stripped only SQL wildcards (`%` and `_`). Characters like `;`, `"`, `--` were not blocked. The validation was also duplicated across routes with inconsistent implementations.

**Fix progression:**
1. Extracted a shared `sanitizeCommunity()` to `server/utils/validation.ts`
2. Replaced the denylist with an **allowlist** — only `[a-zA-Z\s\-'.]` pass:

```typescript
export function sanitizeCommunity(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw.replace(/[^a-zA-Z\s\-'.]/g, '').trim();
  if (cleaned.length === 0 || cleaned.length > 100) return null;
  return cleaned;
}
```

Callers check `=== null` for rejection (400) and `=== undefined` for "no filter."

### 5. Case Sensitivity — community lookup missed matches

Community names are stored title-cased (`Mira Mesa`) but query parameters arrive with inconsistent casing. The initial query used exact string equality.

**Fix:** Applied Prisma's case-insensitive mode on the `/permits` endpoint:

```typescript
community: { equals: cleaned, mode: 'insensitive' }
```

**Known gap:** The permit count query in `metrics.ts` still uses exact-match `community: cleaned` without `mode: 'insensitive'`. This means the permit good-news count can return 0 when casing differs between the query parameter and the stored value. This should be fixed to match the `/permits` endpoint pattern.

### 6. DOM Performance — N popup components for N markers

The original implementation embedded a `<Popup>` inside every `<CircleMarker>`. With up to 5,000 markers, this created 5,000 Leaflet popup DOM nodes on mount, even though at most one is visible at a time.

**Fix:** Switched to a shared singleton popup driven by React state:

```tsx
{permits.map((permit) => (
  <CircleMarker key={`permit-${permit.id}`} ...
    eventHandlers={{ click: () => setSelectedPermit(permit) }}
  />
))}
{selectedPermit && (
  <Popup position={[selectedPermit.lat, selectedPermit.lng]}
    eventHandlers={{ remove: () => setSelectedPermit(null) }}>
    <PermitPopupContent permit={selectedPermit} />
  </Popup>
)}
```

### 7. Missing Select Clause

The initial `/permits` endpoint used `findMany` without a `select` clause, returning every column. This diverged from established patterns and risks leaking future schema additions.

**Fix:** Added explicit `select` matching the `Permit` TypeScript interface.

### 8. Suboptimal Database Index

The initial schema lacked a composite index for the common query pattern `WHERE community = ? AND date_issued >= ?`.

**Fix:** Added a composite `@@index([community, date_issued])`. The single-column `@@index([date_issued])` was retained for queries that filter by date alone (e.g., global recent-permit counts).

### 9. Seed Script Issues

- `$executeRawUnsafe` used for TRUNCATE — replaced with `$executeRaw` tagged template
- After `fetchCsv()` loads the full CSV into memory (synchronous parse), the original code built additional intermediate arrays for filtering, mapping, and deduplication. Refactored to a single-pass loop over the already-loaded rows that processes, deduplicates via a `seen` Set, and batch-inserts every 1,000 rows — avoiding extra full-size array copies.
- `mapPermitRow()` helper extracted for readability

### 10. Test Quality

Initial tests defined a local copy of the validation logic instead of importing the real function. After `sanitizeCommunity` was extracted, tests were updated to import and test the actual production code.

## Prevention Strategies

### Always Use Allowlist Validation

Use an allowlist regex (`/[^permitted-chars]/g`) rather than stripping known-bad characters. The three-way return type (`string | null | undefined`) makes the route handler's logic explicit:

- `string` → valid, use as filter
- `undefined` → not provided, no filter
- `null` → invalid input, return 400

Place all validation in `server/utils/validation.ts`. Never inline validation in route handlers.

### Every Community-Scoped useEffect Needs AbortController

Any `useEffect` that fetches data based on `selectedCommunity` must:
1. Create an `AbortController`
2. Pass `{ signal }` through to `fetch`
3. Return `() => controller.abort()` as cleanup
4. Filter `AbortError` from the catch handler

This is load-bearing, not optional defensive coding. Slow networks and staging environments will expose the race condition.

### Cap Query Results at the ORM Level

Every map overlay endpoint must have an explicit `take` cap (e.g., `take: 5000`). Choose the cap based on what Leaflet can render without frame-rate degradation. For time-series data, add a date window filter as a secondary bound.

### Use Composite Indexes for Multi-Column Queries

When a query filters on column A and sorts/filters on column B, define `@@index([A, B])` with the equality column first. A separate single-column index on A becomes redundant.

### Singleton Popup for Large Marker Sets

Any overlay with more than ~100 markers should use a shared `<Popup>` driven by state, not embed one `<Popup>` per marker. This reduces DOM nodes from N to 1. Complement this with `preferCanvas={true}` on the `MapContainer` so Leaflet renders markers to a single `<canvas>` element instead of individual SVG paths.

### Never Import Prisma in Service Modules

Service modules (`server/services/`) should receive data through function parameters, not query the database directly. This maintains clear layering: routes own data fetching, services own business logic.

### Always Use Explicit Select Clauses

Every `findMany` backing a public API endpoint should enumerate exactly the fields the client needs. This prevents data leakage when schema columns are added later.

## Recommended Test Cases

**Coverage note:** Only the validation tests (items 1–9) are currently implemented in `permits-validation.test.ts`. Route tests, frontend tests, and map rendering tests are not yet written.

### Validation Tests (implemented)

1. `undefined` input → returns `undefined` (no filter, not an error)
2. Valid community name (`"Mira Mesa"`) → passes through unchanged
3. Allowed punctuation: hyphens (`"Mid-City"`), apostrophes (`"O'Farrell"`), periods (`"St. Luke's"`)
4. SQL wildcards stripped: `"Mira%Mesa"` → `"MiraMesa"`
5. Injection characters stripped: semicolons, double-quotes, backticks, angle brackets
6. All characters stripped (`"%%%___"`) → returns `null`
7. Empty string → returns `null`
8. Over-length input (101+ chars) → returns `null`
9. Exactly 100 characters → passes through

### Route Tests (not yet implemented)

10. Missing required parameter → 400
11. Valid parameter → 200 with JSON array
12. Response bounded by `take` cap
13. Every item has non-null `lat` and `lng`
14. Injection attempt sanitized, never produces database error

### Frontend Race Condition Tests (not yet implemented)

15. Rapid community switching → state reflects the latest fetch, not earlier stale responses
16. Abort on unmount → no unhandled rejection or console error
17. Null community → permits state cleared to `[]`

### Map Rendering Tests (not yet implemented)

18. Zero permits → no CircleMarker elements rendered
19. Popup clears on close → `selectedPermit` is null
20. Permits render on top of transit markers (correct z-order)

## Cross-References

### Internal Files

- **Plan:** `plans/issue-8.md` — full implementation plan with acceptance criteria
- **Workplan stretch goal #4:** `docs/plans/block-report-workplan.md:282`
- **Shared validation:** `server/utils/validation.ts`
- **Similar patterns:** Transit stops (`san-diego-map.tsx:436-448`), 311 seeding (`scripts/seed.ts:131-189`)

### Pending Follow-Up (from code review)

- TODO 006 (P1): Four other community-data fetches lack AbortController — permit fetch is the reference pattern
- TODO 011 (P2): Transit stops should adopt the shared popup pattern established by permits
- TODO 010 (P2): Permits endpoint has no caching unlike other location routes
- TODO 013 (P2): Frontend `Permit.lat/lng` non-nullable vs Prisma schema `Float?` type divergence

### Architecture Diagram

```
Client (React)                         Backend (Express)                    PostgreSQL

neighborhood-page.tsx                  server/routes/locations.ts          permits table
  useEffect([selectedCommunity])  →    GET /api/locations/permits          @@index([community, date_issued])
  AbortController cleanup              sanitizeCommunity()
  getPermits(community, {signal})      case-insensitive Prisma filter
                                       select: explicit columns
                                       take: 5000

                                       server/routes/metrics.ts
                                       Promise.all([
                                         community_metrics,
                                         permit.count({community, date >= 180d})
                                       ])
                                       → goodNews[] includes permit signal

san-diego-map.tsx                      server/services/claude.ts
  Singleton Popup (1 DOM node)         profile.goodNews passed through
  selectedPermit state                 (no direct DB access)
  Transit rendered before permits
```
