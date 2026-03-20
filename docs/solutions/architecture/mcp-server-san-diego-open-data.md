---
title: "MCP Server for San Diego Open Data"
date: 2026-03-20
problem_type: architecture
component: "Backend MCP integration, service layer extraction"
tags:
  - mcp-server
  - model-context-protocol
  - service-extraction
  - http-transport
  - stdio-transport
  - authentication
  - caching
  - san-diego-open-data
severity: high
symptoms: |
  Block Report's civic data (311 metrics, library/rec center locations, transit scores,
  language demographics, access gap rankings) was only accessible through the web app UI.
  No way for Claude users to query San Diego data conversationally.
summary: |
  Implemented a complete MCP server with stdio and HTTP transports exposing 9 read-only
  tools for San Diego civic data. Refactored route handlers into reusable service modules.
related_issue: "makyrie/block-report#6"
upstream_issue: "bookchiq/block-report#50"
---

# MCP Server for San Diego Open Data

## Problem Statement

Block Report aggregates San Diego civic data (311 metrics, library/rec center locations, transit scores, language demographics) through its Express REST API, but this data was only accessible via the web UI. The goal was to expose the same data as a Model Context Protocol (MCP) server so any Claude user—whether using Claude Desktop, Claude Code, or remote access—can query San Diego civic data conversationally. This was identified as the **#1 stretch goal** in the hackathon workplan.

## Architecture

```
Claude Desktop / Claude Code
        │
        │ stdio (JSON-RPC over stdin/stdout)
        ▼
┌──────────────────────┐
│   MCP Server         │
│  (server/mcp/)       │
│  - stdio transport   │
│  - HTTP transport    │
└──────────┬───────────┘
           │ imports
           ▼
┌──────────────────────┐     ┌──────────────────────┐
│  Shared Services     │     │  Express Routes      │
│  (server/services/)  │◄────│  (server/routes/)    │
│  - metrics.ts        │     │  Now thin wrappers   │
│  - transit.ts        │     └──────────────────────┘
│  - demographics.ts   │
│  - communities.ts    │
│  - locations.ts      │
│  - block.ts          │
│  - profile.ts        │
│  - geo.ts            │
│  - db.ts (Prisma)    │
└──────────┬───────────┘
           │
           ▼
    External APIs / PostgreSQL
```

Both Express routes and MCP tools are **thin wrappers** that delegate to shared service modules. This ensures 100% business logic parity between the REST API and MCP interface.

## Working Solution

### Phase 1: Service Extraction

Business logic was extracted from Express route handlers into reusable service modules:

| Service | Responsibility |
|---------|---------------|
| `server/services/metrics.ts` | 311 metrics aggregation and "good news" detection |
| `server/services/transit.ts` | Transit score computation with event-loop-aware caching |
| `server/services/demographics.ts` | Census language demographics by community/tract |
| `server/services/locations.ts` | Library/rec-center queries with community filtering |
| `server/services/communities.ts` | Canonical community names, normalization, validation |
| `server/services/geo.ts` | Shared geospatial utilities (haversine, point-in-feature) |
| `server/services/block.ts` | Block-level 311 metrics queries |
| `server/services/profile.ts` | Composite civic profile orchestration |

### Phase 2: MCP Server Core

**Entry points:**
- `server/mcp/index.ts` — Stdio transport (primary, for Claude Desktop/Code)
- `server/mcp/http.ts` — Streamable HTTP transport with bearer token auth

**Tool registration pattern:**
```typescript
// server/mcp/register-tools.ts
export function registerAllTools(server: McpServer): void {
  registerCommunityTools(server);
  registerMetricsTools(server);
  registerProfileTools(server);
  registerGapAnalysisTools(server);
  registerLocationTools(server);
  registerDemographicsTools(server);
  registerTransitTools(server);
  registerBlockTools(server);
}
```

**9 MCP Tools exposed:**

| Tool | Description |
|------|-------------|
| `list_communities` | Canonical community plan names (discovery entry point) |
| `get_311_metrics` | 311 service request metrics by community |
| `get_neighborhood_profile` | Composite profile (311 + transit + demographics + resources) |
| `get_access_gap_ranking` | Ranked neighborhoods by underservice |
| `list_libraries` | Public library locations |
| `list_rec_centers` | Recreation centers (optional community filter) |
| `get_demographics` | Census language demographics by community |
| `get_transit_score` | Transit accessibility (0-100) |
| `get_block_metrics` | 311 metrics near a lat/lng |

### Phase 3: HTTP Transport & Security

- Bearer token auth using `crypto.timingSafeEqual()`
- Session management with 30-minute TTL
- Rate limiting: 60 requests/min per IP
- 16kb JSON body size limit
- Production guard on `MCP_AUTH_DISABLED` flag
- Graceful shutdown with session cleanup

### Key Patterns

#### Service Layer Caching with Inflight Dedup

All data-fetching services follow this consistent pattern:

```typescript
const CACHE_TTL = 24 * 60 * 60 * 1000;
let cache: T | null = null;
let cachedAt = 0;
let inflightFetch: Promise<T> | null = null;

export async function getCached(): Promise<T> {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL) return cache;
  if (inflightFetch) return inflightFetch;

  inflightFetch = fetchData()
    .then(data => { cache = data; cachedAt = now; return data; })
    .finally(() => { inflightFetch = null; });

  return inflightFetch;
}
```

#### Dual-API Validation Abstraction

Both Express and MCP use shared validation, with surface-specific wrappers:

```typescript
// MCP wrapper — returns ToolResult with isError flag
export function withCommunityValidation(
  toolName: string,
  handler: (normalized: string) => Promise<ToolResult>,
): (args: { community_name: string }) => Promise<ToolResult> {
  return withErrorHandling(toolName, async ({ community_name }) => {
    const { valid, normalized, names } = await validateCommunityName(community_name);
    if (!valid) {
      return {
        content: [{ type: 'text', text: `No data found. Use list_communities. Did you mean: ${names.slice(0, 5).join(', ')}?` }],
        isError: true,
      };
    }
    return handler(normalized);
  });
}

// Express wrapper — sends 400/404 HTTP response
export async function parseAndValidateCommunity(req, res): Promise<string | null> { ... }
```

#### Generic Error Handler

```typescript
export function withErrorHandling<T extends Record<string, unknown>>(
  toolName: string,
  handler: (args: T) => Promise<ToolResult>,
): (args: T) => Promise<ToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      logger.error(`MCP tool "${toolName}" failed`, { error: (err as Error).message });
      return {
        content: [{ type: 'text', text: 'Error: An internal error occurred.' }],
        isError: true,
      };
    }
  };
}
```

## Lessons Learned

### 1. Dual API Surfaces Demand Consistency

Express routes and MCP tools were initially implemented with divergent behavior:
- Transit unknown community: Express returned zero values, MCP returned errors
- Suggestion counts: MCP returned 10, Express returned 5

**Fix:** Abstract shared validation logic and enforce single source of truth for error messages and response formats.

### 2. Security-Critical Code Needs Explicit Test Coverage

HTTP transport contains timing-safe token comparison, session capacity limits, and production guards but initially had zero tests. Security paths should be unit-tested before integration tests — they're cheaper to verify in isolation.

### 3. Module-Level Caching Pattern Must Be Consistent

When `getLibraryCountByCommunity` missed the standard caching pattern, it created a performance gap on every profile request. All data-fetching services should follow the same TTL and inflight dedup pattern.

### 4. Inflight Request Deduplication Prevents Race Conditions

When multiple requests hit the same endpoint simultaneously before cache populates, the inflight dedup pattern ensures only one fetch runs — others await the same promise. This prevented redundant API calls during rapid profile requests.

### 5. Early, Detailed Code Review Catches Design Issues

48 commits with 35+ targeted fixes across the branch. Systematic review identified patterns: caching inconsistency, API divergence, test gaps, and redundant exports. Upfront review is more efficient than large end-of-cycle fixes.

## Common Pitfalls

| Pitfall | Impact | Prevention |
|---------|--------|------------|
| Transit route redundancy — `getTransitScore(unknown)` refetches all transit data for city average | Unnecessary full data reload | Export `getCachedCityAverage()` getter |
| Inconsistent suggestion count between Express (5) and MCP (10) | Confusing UX | Standardize in shared constant |
| Missing library cache | Performance regression on profile endpoint | Follow standard caching pattern for all services |
| Untested HTTP transport security paths | Blind spot on public-facing attack surface | Unit test auth, session, rate limiting before integration |
| Redundant derived caches (e.g., separate `communityNamesCache`) | Extra state, no benefit when extraction is µs-fast | Derive inline from source cache |

## Prevention Strategies

### API Contract Consistency Checklist

Before shipping dual-surface APIs (Express + MCP):
- Both surfaces return same error format for same errors
- Both surfaces return same number of suggestions on validation failure
- Both surfaces handle unknown input identically (error vs fallback)
- Create shared test suite validating both against same contract

### Service Layer Caching Standards

- Use module-level cache with TTL (24h default)
- Implement inflight dedup to prevent concurrent redundant requests
- Document cache keys and TTL in code comments
- Consider extracting to reusable `createCachedFetcher(key, fetchFn, ttl)` utility

### Security-Critical Code Audit

For any new auth, session, or rate-limiting code:
- Identify all security paths (happy path, auth failure, capacity exceeded)
- Write unit tests for each path before integration tests
- Use `crypto.timingSafeEqual` for secret comparison, never `===`
- Add production guards for unsafe configurations

## Test Coverage

| Category | Status |
|----------|--------|
| Helpers & validation wrappers | Covered |
| HTTP transport security (token, sessions, capacity) | Covered |
| Service logic (transit, metrics, block, demographics, communities, geo) | Covered |
| Formatting utilities | Covered |
| Full request flow integration tests | Gap |
| MCP tool registration and dispatch | Gap |
| Caching behavior (TTL expiry, inflight dedup) | Gap |
| Graceful shutdown | Gap |

## Running the MCP Server

```bash
# Stdio transport (Claude Desktop/Code)
pnpm mcp

# HTTP transport (remote access)
pnpm mcp:http
```

**Claude Desktop configuration:**
```json
{
  "mcpServers": {
    "block-report": {
      "command": "node",
      "args": ["--env-file=.env", "--import=tsx", "server/mcp/index.ts"],
      "cwd": "/path/to/block-report"
    }
  }
}
```

## Cross-References

- **Plan:** `plans/issue-6.md` — Full technical specification
- **Issue:** makyrie/block-report#6
- **Upstream:** bookchiq/block-report#50
- **README:** MCP Server section (lines 133-191)
- **Workplan:** `docs/plans/block-report-workplan.md` — MCP as #1 stretch goal

### Related Todo Items (Review Findings)

- `todos/005-pending-p2-missing-http-transport-tests.md`
- `todos/006-pending-p2-missing-validation-tests.md`
- `todos/007-pending-p2-inconsistent-error-suggestions.md`
- `todos/008-pending-p2-transit-route-fallback-redundancy.md`
- `todos/009-pending-p2-library-count-no-caching.md`
- `todos/010-pending-p2-duplicate-city-average-export.md`
- `todos/011-pending-p3-redundant-community-names-cache.md`
- `todos/012-pending-p3-redundant-resort-top-underserved.md`
- `todos/013-pending-p3-timing-safe-equal-length-oracle.md`
- `todos/014-pending-p3-geo-variable-naming.md`
- `todos/015-pending-p3-cache-no-test-reset.md`
- `todos/016-pending-p3-rec-center-missing-index.md`
