---
title: "feat: MCP Server for San Diego Open Data"
type: feat
status: completed
date: 2026-03-20
---

# feat: MCP Server for San Diego Open Data

## Overview

Wrap the Block Report's San Diego civic data as an MCP (Model Context Protocol) server so any Claude user can query city data — 311 metrics, library/rec center locations, transit scores, language demographics, and access gap rankings — directly from their AI assistant.

This was identified as the **#1 stretch goal** and biggest bonus-point opportunity in the hackathon workplan (`docs/plans/block-report-workplan.md`, line 279).

## Problem Statement / Motivation

Block Report already aggregates San Diego open data into a usable format via its Express API. But this data is only accessible through the web app UI. An MCP server would make the same data conversationally accessible to any Claude Desktop or Claude Code user, dramatically expanding reach without building new UI. It also demonstrates the project's technical sophistication for hackathon judging.

## Proposed Solution

Build a standalone MCP server that:
1. Imports the existing Prisma database client and service functions
2. Exposes read-only tools for querying civic data
3. Supports **stdio transport** (primary — for Claude Desktop/Code) and **Streamable HTTP transport** (secondary — for remote access)
4. Runs as a separate process from the Express app, sharing the same database

## Technical Approach

### Architecture

```
Claude Desktop / Claude Code
        │
        │ stdio (JSON-RPC over stdin/stdout)
        ▼
┌──────────────────────┐
│   MCP Server Process │
│   (server/mcp/)      │
│                      │
│   McpServer instance │
│   ├── tools/         │──── Tool handlers (thin wrappers)
│   └── transport      │
└──────────┬───────────┘
           │ imports
           ▼
┌──────────────────────┐
│  Shared Services     │
│  (server/services/)  │
│  ├── db.ts (Prisma)  │
│  ├── metrics.ts      │ ◄── NEW (extracted from routes/metrics.ts)
│  ├── transit.ts      │ ◄── NEW (extracted from routes/transit.ts)
│  ├── demographics.ts │ ◄── NEW (extracted from routes/demographics.ts)
│  ├── communities.ts  │ ◄── NEW (canonical community name list)
│  ├── gap-analysis.ts │     (already exists as a service)
│  └── locations.ts    │ ◄── NEW (extracted from routes/locations.ts)
└──────────┬───────────┘
           │
           ▼
    Neon PostgreSQL (Prisma)
```

### MCP Tool Definitions

All tools are **read-only**. Tool names use `snake_case` per MCP convention.

| Tool | Description | Inputs | Data Source |
|------|-------------|--------|-------------|
| `list_communities` | List all valid San Diego community plan names | none | GeoJSON boundary file (cached) |
| `get_311_metrics` | Get 311 service request metrics for a community | `community_name: string` | `get_community_metrics()` SQL function |
| `get_neighborhood_profile` | Get composite civic profile (311 + demographics + transit + resources + access gap) | `community_name: string` | Multiple services aggregated |
| `get_access_gap_ranking` | Get ranked list of underserved neighborhoods | `limit?: number (default 10, max 50)` | `gap-analysis.ts` |
| `list_libraries` | List San Diego public library locations | `community_name?: string` (optional filter) | `prisma.library.findMany()` |
| `list_rec_centers` | List recreation center locations | `community_name?: string` (optional filter) | `prisma.recCenter.findMany()` |
| `get_demographics` | Get Census language demographics for a community | `community_name: string` | `census_language` table aggregated by community |
| `get_transit_score` | Get transit accessibility score for a community | `community_name: string` | Transit score computation |
| `get_block_metrics` | Get 311 metrics near a specific location | `lat: number, lng: number, radius?: number` | Block-level 311 query |

### Implementation Phases

#### Phase 1: Service Extraction (prerequisite)

Extract business logic from Express route handlers into reusable service modules. This is the single largest prerequisite — currently, route handlers contain the computation logic that both Express and MCP need.

**Tasks:**

- [x] Create `server/services/metrics.ts` — extract 311 metrics aggregation and "good news" computation from `server/routes/metrics.ts`
- [x] Create `server/services/transit.ts` — extract `computeAllScores`, `getScores`, `getCityAverage` from `server/routes/transit.ts`
- [x] Create `server/services/demographics.ts` — extract `computeTopLanguages` from `server/routes/demographics.ts` and add community-level aggregation using the `census_language.community` column (same approach as `gap-analysis.ts` lines 111-134)
- [x] Create `server/services/locations.ts` — extract library/rec-center queries with optional community filtering
- [x] Create `server/services/communities.ts` — fetch/cache canonical community names from GeoJSON boundary file, provide name normalization and validation
- [x] Refactor existing Express routes to use the new service modules (no behavior change)
- [x] Verify all existing API endpoints still work after refactoring

**Key technical detail:** The demographics route currently has a TODO at `server/routes/demographics.ts:70-75` noting that community-to-tract crosswalk is not implemented. The new `demographics.ts` service should query `census_language` directly by the `community` column (which already exists in the table) rather than requiring a tract crosswalk. This is the same approach `gap-analysis.ts` uses successfully.

#### Phase 2: MCP Server Core

Build the MCP server infrastructure with stdio transport.

**Tasks:**

- [x] Install dependencies: `@modelcontextprotocol/sdk`, `zod`
- [x] Create `server/mcp/index.ts` — McpServer creation, tool registration, stdio transport connection
- [x] Create `server/mcp/tools/communities.ts` — `list_communities` tool
- [x] Create `server/mcp/tools/metrics.ts` — `get_311_metrics` tool
- [x] Create `server/mcp/tools/profile.ts` — `get_neighborhood_profile` tool
- [x] Create `server/mcp/tools/gap-analysis.ts` — `get_access_gap_ranking` tool
- [x] Create `server/mcp/tools/locations.ts` — `list_libraries`, `list_rec_centers` tools
- [x] Create `server/mcp/tools/demographics.ts` — `get_demographics` tool
- [x] Create `server/mcp/tools/transit.ts` — `get_transit_score` tool
- [x] Create `server/mcp/tools/block.ts` — `get_block_metrics` tool
- [x] Add `"mcp"` script to `package.json`: `"node --env-file=.env --import=tsx server/mcp/index.ts"`
- [x] Add graceful shutdown handler (SIGTERM/SIGINT → `prisma.$disconnect()`)
- [x] Ensure all logging uses `console.error()` (stdout reserved for MCP protocol in stdio mode)

**Community name normalization:** All tools accepting `community_name` should normalize input (trim, uppercase) and validate against the canonical community list. On mismatch, return a helpful error with the list of valid names.

**Error handling pattern:**

```typescript
// All tools follow this pattern
try {
  const data = await serviceFunction(params);
  if (!data) {
    return {
      content: [{ type: 'text', text: `No data found for community: ${community_name}. Use list_communities to see valid names.` }],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
} catch (err) {
  return {
    content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
    isError: true,
  };
}
```

#### Phase 3: HTTP Transport & Polish

Add Streamable HTTP transport for remote access and polish the implementation.

**Tasks:**

- [x] Create `server/mcp/http.ts` — Streamable HTTP transport entry point
- [x] Add bearer token authentication for HTTP transport (token from `MCP_AUTH_TOKEN` env var)
- [x] Add `"mcp:http"` script to `package.json`
- [x] Document Claude Desktop configuration (`claude_desktop_config.json` snippet)
- [x] Add MCP configuration to `README.md`
- [x] Curate response field selection for list tools (return only conversationally useful fields: name, address, lat, lng, phone)
- [x] Add example community names to tool descriptions to help Claude use them correctly

### File Structure

```
server/
  mcp/
    index.ts              # Entry point: McpServer + stdio transport
    http.ts               # Entry point: Streamable HTTP transport
    tools/
      communities.ts      # list_communities
      metrics.ts          # get_311_metrics
      profile.ts          # get_neighborhood_profile
      gap-analysis.ts     # get_access_gap_ranking
      locations.ts        # list_libraries, list_rec_centers
      demographics.ts     # get_demographics
      transit.ts          # get_transit_score
      block.ts            # get_block_metrics
  services/               # (existing + new extracted services)
    db.ts                 # Prisma client (existing)
    gap-analysis.ts       # Access gap scoring (existing)
    claude.ts             # Claude API client (existing)
    report-cache.ts       # Report caching (existing)
    metrics.ts            # NEW: 311 metrics service
    transit.ts            # NEW: Transit score service
    demographics.ts       # NEW: Demographics service
    locations.ts          # NEW: Location queries with filtering
    communities.ts        # NEW: Canonical community name list
```

## System-Wide Impact

- **Interaction graph**: MCP tools → shared service functions → Prisma client → Neon PostgreSQL. No side effects, all read-only.
- **Error propagation**: Tool handlers catch all errors and return `{ isError: true }` responses. Database connection failures surface as tool errors. Transport-level errors are handled by the SDK.
- **State lifecycle risks**: Minimal — all tools are stateless read operations. The in-memory caches in transit and gap-analysis services are recomputed on MCP server restart. The Prisma client connection pool needs explicit cleanup on shutdown.
- **API surface parity**: The MCP server exposes the same data as the Express API but through MCP tools instead of REST endpoints. No new data access patterns are introduced.
- **Integration test scenarios**: (1) Tool call with valid community name returns expected data shape. (2) Tool call with invalid community name returns helpful error. (3) stdio transport roundtrip with JSON-RPC message. (4) Database unavailability returns isError response. (5) Concurrent tool calls from multiple clients.

## Acceptance Criteria

### Functional Requirements

- [ ] All 9 MCP tools respond correctly when called via stdio transport
- [ ] `list_communities` returns the canonical list of San Diego community plan names
- [ ] Community name inputs are case-insensitive (normalized internally)
- [ ] Invalid community names return helpful error with suggestion to use `list_communities`
- [ ] `get_neighborhood_profile` aggregates data from multiple services into a single response
- [ ] All tools return properly formatted MCP tool responses (`{ content: [...] }`)
- [ ] Error responses use `isError: true` flag
- [ ] MCP server starts via `npm run mcp` (stdio) and `npm run mcp:http` (HTTP)

### Non-Functional Requirements

- [ ] Existing Express API endpoints continue to work unchanged after service extraction refactor
- [ ] MCP server process shuts down gracefully on SIGTERM/SIGINT
- [ ] No `console.log()` calls in MCP server code (stdout reserved for protocol)
- [ ] All tool input schemas include `.describe()` on every parameter
- [ ] Response payloads are curated for conversational use (no unnecessary fields)

### Quality Gates

- [ ] Claude Desktop can connect to the MCP server and invoke all tools
- [ ] README includes Claude Desktop configuration instructions
- [ ] `package.json` includes `mcp` script

## Dependencies & Risks

### Dependencies

- `@modelcontextprotocol/sdk` — official MCP TypeScript SDK
- `zod` — input validation (peer dependency of MCP SDK)
- Existing Prisma/Neon database connection (`server/services/db.ts`)
- External: `seshat.datasd.org` for community boundary GeoJSON (used by transit/gap-analysis)

### Risks

| Risk | Mitigation |
|------|------------|
| Service extraction breaks existing Express routes | Refactor incrementally, verify each endpoint after extraction |
| Neon cold start latency on first tool call | Accept for stdio (short-lived); connection warmup for HTTP |
| `seshat.datasd.org` downtime breaks transit/gap tools | Cache GeoJSON indefinitely within process lifetime |
| Community name mismatches across data sources | Single normalization function + canonical list from GeoJSON |
| Large response payloads waste context tokens | Curate fields, add optional `detail` parameter |

## Alternative Approaches Considered

| Approach | Verdict | Reason |
|----------|---------|--------|
| Mount MCP on existing Express app (single process) | Rejected | Entangles MCP lifecycle with HTTP server; rate limiting/CORS config conflicts; stdio transport requires separate process anyway |
| Duplicate business logic in MCP tools | Rejected | Maintenance burden, divergence risk; extract services instead |
| Expose only raw database queries as tools | Rejected | Too low-level; the aggregated views (profiles, gap scores) are the value |
| Include report generation as MCP tool | Deferred to v2 | Read-only tools first; report generation has cost implications (Claude API calls) and is a write operation |
| Use MCP resources instead of tools | Deferred | Tools are more flexible for parameterized queries; resources better for static data |

## Success Metrics

- Claude Desktop can query all 9 tools and receive meaningful data
- A Claude user can ask "What are the top issues in Mira Mesa?" and get a useful answer via MCP
- Existing Express API is unaffected by the refactoring
- README documents MCP setup in under 5 minutes

## Sources & References

### Internal References

- Workplan stretch goal: `docs/plans/block-report-workplan.md:279`
- Existing services: `server/services/db.ts`, `server/services/gap-analysis.ts`, `server/services/claude.ts`
- Routes to extract from: `server/routes/metrics.ts`, `server/routes/transit.ts`, `server/routes/demographics.ts`, `server/routes/locations.ts`, `server/routes/block.ts`
- Prisma schema: `prisma/schema.prisma`
- Type definitions: `src/types/index.ts`

### External References

- MCP TypeScript SDK: `@modelcontextprotocol/sdk` on npm
- MCP specification: https://modelcontextprotocol.io
- Build a server tutorial: https://modelcontextprotocol.io/docs/develop/build-server

### Related Work

- GitHub issue: makyrie/block-report#6
- Upstream issue: bookchiq/block-report#50
