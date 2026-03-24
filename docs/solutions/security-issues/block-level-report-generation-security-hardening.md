---
title: "Block-Level Report Generation — Security Hardening & Architecture Patterns"
date: "2026-03-18"
problem_type: "feature_implementation_with_security_hardening"
severity: "mixed (P1-P3)"
component: "block-report-system"
tags: [security, architecture, testing, caching, prompt-injection, race-conditions, validation, claude-api]
environment: "Node/Express + React + Anthropic Claude API"
github_issues: ["makyrie/block-report#3", "bookchiq/block-report#26"]
---

# Block-Level Report Generation — Security Hardening & Architecture Patterns

## Problem Summary

Issue #3 added address-anchored block report generation: users click the map or enter an address to get a hyperlocal civic brief via Claude API. The initial feature (2 commits, ~600 LOC across 22 files) worked functionally but contained **45+ security, architecture, and reliability gaps** identified during multi-agent code review. These were fixed in 30+ subsequent commits.

This document captures the **patterns and prevention strategies** learned, not individual fixes.

### Symptoms Found During Review

**P1 — Security (5 findings)**
- Unsafe type assertion on Claude API response (no runtime validation)
- Prompt injection via unsanitized address/communityName in Claude prompts
- Raw string lat/lng passed to cache keys and generation (cache misses, type confusion)
- Sanitization functions not exported or directly tested
- Tests duplicated regex inline instead of calling actual sanitization functions

**P2 — Architecture (11 findings)**
- Data round-trip: frontend sent server-computed block metrics back to server
- Unbounded `inFlightGenerations` Map (memory leak under load)
- No AbortController on frontend block data fetch
- Duplicate coalesce-generate-cache pattern across 3 handlers
- Single rate limiter with fragile prefix matching across multiple endpoints
- Cache TTL not enforced at read time (stale reports served indefinitely)
- Cache I/O untested (save/get/TTL round-trip)

**P3 — Cleanup (5 findings)**
- Duplicate TTL constants across files
- Duplicate type definitions (StoredReport vs CommunityReport fields)
- `window.location` usage in component (breaks SSR/testing)
- Cache key radius not clamped to valid range
- O(n) eviction on every cache write

## Root Cause Analysis

1. **Trust boundary violations** — Frontend data round-tripped untrusted client state back to server for Claude prompt construction
2. **Insufficient input validation** — Claude API responses and user-supplied coordinates not validated at runtime, only type-asserted
3. **Code duplication** — Coalesce-generate-cache pattern copy-pasted across handlers instead of extracted
4. **Unbounded resource growth** — In-flight request maps and cache entries lacked size caps
5. **Testing gaps** — Critical I/O and sanitization paths untested; tests that existed tested copied logic, not actual functions

## Key Solution Patterns

### 1. Tiered Input Sanitization

Different sanitization levels based on how the value flows through the system:

```typescript
// Level 1: Display — strip control chars and brackets
export function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>{}[\]]/g, '')
    .slice(0, maxLen);
}

// Level 2: Prompt interpolation — whitelist only address-safe chars
export function sanitizePromptValue(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[^a-zA-Z0-9\s,.\-/#'()áéíóúñüÁÉÍÓÚÑÜ]/g, '')
    .slice(0, maxLen);
}

// Level 3: Structured data — clamp numeric ranges, limit array sizes
export function sanitizeBlockMetrics(raw: BlockMetrics): BlockMetrics {
  return {
    totalRequests: Math.max(0, Math.floor(Number(raw.totalRequests) || 0)),
    resolutionRate: Math.min(1, Math.max(0, Number(raw.resolutionRate) || 0)),
    radiusMiles: Math.min(2, Math.max(0.1, Number(raw.radiusMiles) || 0.25)),
    topIssues: (Array.isArray(raw.topIssues) ? raw.topIssues : [])
      .slice(0, 10)
      .map((i) => ({
        category: sanitizeString(i.category, 100),
        count: Math.max(0, Math.floor(Number(i.count) || 0)),
      })),
    // ... all nested fields similarly constrained
  };
}
```

**When to use:** `sanitizePromptValue` for values interpolated into prompt templates. `sanitizeString` for values in JSON data structures. `sanitizeBlockMetrics` for structured objects from untrusted sources.

### 2. Runtime Response Validation

Never cast untyped external API responses — validate shape first:

```typescript
// BEFORE (unsafe)
return {
  ...(toolBlock.input as Omit<CommunityReport, 'generatedAt'>),
  generatedAt: new Date().toISOString(),
};

// AFTER (validated)
function validateReportShape(input: unknown): input is Omit<CommunityReport, 'generatedAt'> {
  if (typeof input !== 'object' || input === null) return false;
  const obj = input as Record<string, unknown>;
  return (
    typeof obj.neighborhoodName === 'string' &&
    typeof obj.language === 'string' &&
    typeof obj.summary === 'string' &&
    Array.isArray(obj.goodNews) &&
    Array.isArray(obj.topIssues) &&
    Array.isArray(obj.howToParticipate) &&
    typeof obj.contactInfo === 'object' && obj.contactInfo !== null
  );
}

if (!validateReportShape(toolBlock.input)) {
  logger.error('Claude response does not match expected report structure', {
    keys: Object.keys(toolBlock.input as object),
  });
  throw new Error('Claude response does not match expected report structure');
}
```

### 3. Eliminate Data Round-Trips Through Untrusted Clients

```typescript
// BEFORE: Frontend sends computed data back to server
const { blockMetrics } = req.body; // Client-supplied — fabrication possible
const report = await generateAddressBlockReport(..., blockMetrics, ...);

// AFTER: Server fetches what it needs
const { address, lat, lng, language } = req.body;
const latNum = Number(lat);
const lngNum = Number(lng);
// Validate bounds...
const blockMetrics = await fetchBlockData(latNum, lngNum, radiusMiles); // Server-side
const report = await generateAddressBlockReport(..., blockMetrics, ...);
```

### 4. Bounded Resource Coalescing

```typescript
const MAX_IN_FLIGHT = 50;
const inFlightGenerations = new Map<string, Promise<CommunityReport>>();

async function coalesceAndGenerate(
  coalescingKey: string,
  generateFn: () => Promise<CommunityReport>,
  cacheFn: (report: CommunityReport) => Promise<void>,
): Promise<CommunityReport> {
  let reportPromise = inFlightGenerations.get(coalescingKey);

  if (!reportPromise) {
    if (inFlightGenerations.size >= MAX_IN_FLIGHT) {
      throw new Error('Too many concurrent report generations');
    }
    reportPromise = generateFn();
    inFlightGenerations.set(coalescingKey, reportPromise);
    reportPromise.finally(() => inFlightGenerations.delete(coalescingKey));
  }

  const report = await reportPromise;
  try { await cacheFn(report); } catch { /* log, don't block */ }
  return report;
}
```

### 5. Frontend Request Cancellation

Cancel stale fetches with AbortController in effect cleanup to prevent wasted server resources:

```typescript
useEffect(() => {
  if (!pinnedLocation) return;
  const controller = new AbortController();

  const timer = setTimeout(() => {
    getBlockData(lat, lng, radius, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setBlockData(data); })
      .catch((err) => { if (!controller.signal.aborted) console.error(err); });
  }, 250); // Debounce

  return () => { clearTimeout(timer); controller.abort(); };
}, [pinnedLocation, blockRadius]);
```

## Prevention Checklist

Use before submitting LLM-integrated features:

### Security (P1 — block PRs if missing)
- [ ] Claude/LLM responses validated at runtime before type assertion
- [ ] All values interpolated into prompts use `sanitizePromptValue` (whitelist, not blacklist)
- [ ] Sanitization functions exported and directly unit-tested with adversarial inputs
- [ ] Numeric inputs (lat/lng/radius) validated as numbers and bounds-checked before use
- [ ] Cache keys use validated values, not raw request body strings
- [ ] Sanitization applied at service layer (not just route layer) for defense in depth
- [ ] Cache deserialization validates shape before returning (tampered files)

### Architecture (P2 — flag in review)
- [ ] Server does not accept pre-computed data from frontend that it could fetch itself
- [ ] In-flight request maps have a size cap with 503 response when exceeded
- [ ] Cache reads enforce TTL (stale entries return null)
- [ ] Rate limiters are explicit per-endpoint, not prefix-matched
- [ ] Frontend fetches use AbortController in effect cleanup

### Quality (P3 — polish)
- [ ] Constants defined once, imported everywhere (no duplicate TTL values)
- [ ] No `window.location` in components (accept as prop or guard with `typeof window`)
- [ ] Eviction runs on timer, not on every write
- [ ] Cache key inputs clamped/normalized before key construction

## Testing Strategy

Write these tests **alongside** the feature, not after review:

1. **Sanitization** — Test each exported sanitizer with prompt injection payloads, control chars, Unicode
2. **Response validation** — Test with valid shapes, missing fields, wrong types
3. **Cache I/O** — Round-trip: save → get → verify; get after TTL → null; missing file → null
4. **Coalescing** — Two concurrent calls with same key → `generateFn` called once
5. **Numeric bounds** — Radius clamping, lat/lng NaN rejection, coordinate range validation

## Known Remaining Gaps

Identified during specialized security review, not yet addressed:

| Severity | Gap | Location |
|----------|-----|----------|
| Medium | `language` parameter sanitized at route layer only — service functions trust it directly | `server/services/claude.ts` |
| Medium | `communityMetrics` still accepted from client (data round-trip not fully eliminated) | `server/routes/report.ts` |
| Medium | No rate limiting middleware visible on report generation endpoints | `server/routes/report.ts` |
| Low | Response validator checks array existence but not element types | `server/services/claude.ts` |
| Low | Cache reads deserialize JSON without running `validateReportShape` | `server/services/report-cache.ts` |
| Low | Path traversal defense in `sanitizeFilename` not tested with adversarial input | `server/utils/language.ts` |

## Cross-References

- **Feature plan:** `plans/issue-3.md` — full specification and acceptance criteria
- **Architecture:** `CLAUDE.md` — project conventions, workstream ownership, API routes
- **Workplan:** `docs/plans/block-report-workplan.md` — original hackathon interface definitions
- **Pending todos:** `todos/060-076` — remaining review findings (P1-P3)
- **Key files:** `server/services/claude.ts`, `server/services/block-data.ts`, `server/services/report-cache.ts`, `server/routes/report.ts`
