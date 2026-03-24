---
name: express-app-serverless-vercel-deployment
description: Converting a Node.js/Express + React/Vite app to Vercel serverless with strategy-pattern caching, lazy Prisma init, CORS validation, DB-backed rate limiting, and prompt injection sanitization
type: integration-issues
problem_type: architecture-modernization-for-serverless
component: backend-infrastructure
symptoms:
  - File-based report cache writes fail silently on ephemeral serverless filesystem
  - Module-level throws on missing DATABASE_URL prevent local frontend-only development
  - In-memory caches reset on cold starts causing expensive re-computation
  - CORS blocks dynamic Vercel preview deployment URLs
  - Request timeouts exceed Vercel function limits during Claude API calls
  - Rate limiting ineffective across serverless instances due to in-memory state
  - Input validation gaps allow prompt injection via language parameter
technologies:
  - Node.js
  - Express.js
  - React
  - Vite
  - TypeScript
  - Vercel (serverless)
  - Neon PostgreSQL
  - Prisma ORM
  - Anthropic Claude API
related:
  - plans/issue-10.md
  - makyrie/block-report#10
  - bookchiq/block-report#55
---

# Deploying a Node.js/Express + React/Vite App to Vercel Serverless

## Problem

A standard Express app cannot run as-is on Vercel serverless for several structural reasons:

- **No persistent filesystem.** Vercel function instances are ephemeral. File-based caches (`server/cache/`) and log files written during one invocation are gone by the next.
- **No persistent process.** Each request may land on a cold-started instance. In-memory rate limiting resets on every cold start, giving zero cross-instance protection.
- **No long-running server.** Vercel expects a single exported handler, not `app.listen()`.
- **No cron scheduler.** `setInterval` and `node-cron` don't survive between invocations.
- **60-second hard limit.** The original Claude API client had no timeout, making it possible for a stalled call to exhaust the function duration.
- **CORS origin uncertainty.** Every Vercel preview deployment gets a unique `.vercel.app` URL.
- **Trust proxy required.** `req.ip` is wrong without `app.set('trust proxy', 1)` behind Vercel's load balancer.

## Root Cause

The app was designed as a traditional long-running Node.js server with file-based persistence, in-memory state, and direct `app.listen()`. Serverless functions are stateless, ephemeral, and have strict time/filesystem constraints that break these assumptions.

## Solution Overview

A single `isVercel` flag threads through the application to switch between two operating modes:

| Concern | Local dev | Vercel production |
|---|---|---|
| Report cache | File (`server/cache/reports/`) | Neon PostgreSQL via Prisma |
| Rate limiting | Bypassed with warning | DB-backed count query |
| Logging | File stream + console | Console-only |
| Cache purge | No-op | Vercel Cron every 6h |
| Entry point | `server/index.ts` (app.listen) | `api/index.ts` (exports app) |

## Key Changes

### 1. Cache Strategy Pattern (file vs DB)

`server/services/report-cache.ts` defines a `CacheStrategy` interface with two implementations. Selection happens once at module load:

```typescript
interface CacheStrategy {
  get(community: string, language: string): Promise<CommunityReport | null>;
  set(community: string, language: string, report: CommunityReport): Promise<void>;
  countRecent(sinceMs: number): Promise<number>;
  purgeStale(): Promise<number>;
}

const strategy: CacheStrategy = isVercel ? dbStrategy : fileStrategy;
```

- `dbStrategy.set` uses Prisma `upsert` with `createdAt: new Date()` in both `create` and `update` arms so TTL refreshes on cache hit.
- `fileStrategy.countRecent` always returns `0` and logs a warning — rate limiting is a no-op locally but explicit about it.
- Key normalization is a single exported function used by both strategies and route handlers.
- Block reports reuse the same strategy with a `"block:"` key prefix.

### 2. Lazy Prisma Initialization

`server/services/db.ts` avoids crashing at module import when `DATABASE_URL` is missing:

```typescript
let _proxyClient: PrismaClient | null = null;
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    if (!_proxyClient) _proxyClient = getPrisma();
    return Reflect.get(_proxyClient, prop);
  },
});
```

Consumers import `prisma` normally. The `PrismaClient` is only constructed on first property access. Pool size is `max: 2` for Neon free-tier limits. Disconnect handlers registered on `SIGTERM`/`SIGINT`/`beforeExit`.

### 3. CORS for Dynamic Vercel URLs

`server/app.ts` builds the origin list at startup, only trusting `VERCEL_URL` if it ends in `.vercel.app`:

```typescript
if (process.env.VERCEL_URL) {
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl.endsWith('.vercel.app')) {
    allowedOrigins.push(`https://${vercelUrl}`);
  }
}
```

### 4. Health Check Endpoints

Two probes: liveness (instant, no DB) and readiness (DB check with 5s timeout). The timeout handle is cleared in `finally` to prevent timer leaks in serverless.

### 5. DB-Backed Rate Limiting

```typescript
export async function isGenerationRateLimited(): Promise<boolean> {
  try {
    const count = await strategy.countRecent(GENERATION_RATE_WINDOW_MS);
    return count >= GENERATION_RATE_LIMIT;
  } catch {
    return true; // Fail closed to protect Claude API budget
  }
}
```

Cache lookup and rate limit check are parallelized with `Promise.all`.

### 6. Input Sanitization

Recursive `sanitizeStringFields` function in `server/services/claude.ts` guards against prompt injection:
- Strips control characters (`\x00-\x1f\x7f`)
- Truncates strings to domain-appropriate maximums
- Limits array lengths (50) and object key counts (100)
- Enforces recursion depth limit (10)

### 7. Cron-Based Cache Purge

Protected endpoint at `/api/cron/purge-cache` using `timingSafeEqual` for secret comparison. Vercel Cron triggers it every 6 hours via `vercel.json`.

## Pitfalls Addressed in Review

These anti-patterns were caught during code review (30+ fix commits):

| Pitfall | Impact | Fix |
|---|---|---|
| `createdAt` not refreshed on upsert update | Stale TTL makes cache entries expire prematurely | Added `createdAt: new Date()` to update arm |
| Proxy called `getPrisma()` on every access | Unnecessary overhead per DB call | Cache resolved client in `_proxyClient` |
| Rate limiting fails open on DB error | DB outage → unbounded Claude API spend | Changed to `return true` (fail closed) |
| Timer leak in readiness probe | Event loop stays alive, function hangs | `clearTimeout` in `finally` block |
| `req.body` mutation in route handler | Shared mutable state across middleware | Shallow-clone before modifying |
| `===` for cron secret comparison | Timing attack vulnerability | Use `timingSafeEqual` with length pre-check |
| `JSON.stringify(obj, null, 2)` in prompts | Whitespace wastes Claude input tokens | Use compact `JSON.stringify(obj)` |
| `buildCommand` included `migrate deploy` | Fails on every subsequent deploy if schema is current | Run migrations separately |
| `CRON_SECRET` unset → accept all requests | Anyone can trigger cache purge | Reject when secret is undefined |
| `anchor.id` not validated | Prompt injection via anchor field | Added to field validation |

## Prevention Checklist

When deploying any Express app to serverless:

### Filesystem
- [ ] Audit every `fs` write call — serverless filesystem is ephemeral
- [ ] Replace file-based caches with a persistent store (Postgres, Redis, KV)

### State and Initialization
- [ ] Wrap all external client construction in lazy-init functions
- [ ] Register `SIGTERM`/`SIGINT` disconnect handlers for DB pools
- [ ] Never crash at module load for missing env vars — defer to first use

### Rate Limiting
- [ ] Move rate-limit state to a shared store for cross-instance protection
- [ ] Fail closed if rate-limit store is unreachable
- [ ] Log a startup warning when in-memory limiting is active on serverless

### CORS
- [ ] Validate `VERCEL_URL` domain suffix before adding to allow-list
- [ ] Provide `CORS_ORIGIN` env var for explicit overrides

### Timeouts
- [ ] Set explicit timeouts on all outbound API clients
- [ ] Budget timeouts to leave cold-start headroom (e.g., 40s client timeout within 60s function limit)
- [ ] Clear all `setTimeout` handles in `finally` blocks

### Security
- [ ] Use `timingSafeEqual` for secret comparison
- [ ] Sanitize all user input embedded in LLM prompts (strings, arrays, objects)
- [ ] Set `trust proxy` when behind a load balancer

## Test Cases

### Serverless Readiness
- Start with `DATABASE_URL` unset — confirm non-DB routes still work
- Write to cache on read-only filesystem — confirm graceful failure (no crash)
- Rate-limit check with unreachable DB — confirm returns `true` (blocked)

### CORS
- Request from untrusted origin — confirm rejected
- Request with `CORS_ORIGIN` unset — confirm localhost fallback

### Prompt Injection
- `communityName` > 100 chars — confirm 400 before any Claude call
- `language` with embedded instructions — confirm sanitized
- Deeply nested object (depth > 10) — confirm rejection

### Cron Authorization
- Missing `Authorization` header — confirm 401
- `CRON_SECRET` unset — confirm 401 (not default-allow)
- Correct secret — confirm 200

## References

- Deployment plan: `plans/issue-10.md`
- Vercel config: `vercel.json`
- Serverless entry: `api/index.ts`
- Cache strategy: `server/services/report-cache.ts`
- Lazy Prisma: `server/services/db.ts`
- CORS/health/cron: `server/app.ts`
- Claude sanitization: `server/services/claude.ts`
- Environment flag: `server/env.ts`
- GitHub issue: makyrie/block-report#10
- Upstream issue: bookchiq/block-report#55
