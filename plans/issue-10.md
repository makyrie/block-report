---
title: "feat: Deploy Block Report to Vercel"
type: feat
status: completed
date: 2026-03-20
---

# feat: Deploy Block Report to Vercel

## Overview

Deploy Block Report to a public Vercel URL so the app is accessible without running locally. The project already has partial Vercel infrastructure (`vercel.json`, `api/index.ts` serverless entry point, Neon serverless DB adapter). This plan addresses the remaining gaps to achieve a production-ready deployment.

## Problem Statement / Motivation

The app currently requires local setup (Node.js, pnpm, `.env` with API keys, running both frontend and backend). Deploying to a public URL:
- Eliminates the need for a demo video
- Makes the project accessible to judges, stakeholders, and the public
- Validates the architecture works in a real serverless environment

## Current State (Already Done)

The following deployment infrastructure already exists:

| Component | File | Status |
|-----------|------|--------|
| Vercel config | `vercel.json` | Build command, output dir, rewrites for API + SPA fallback |
| Serverless entry | `api/index.ts` | Re-exports Express app from `server/app.ts` |
| Express app/server split | `server/app.ts` / `server/index.ts` | App separated from listener |
| Neon serverless DB | `server/services/db.ts` | `@neondatabase/serverless` + `@prisma/adapter-neon` |
| Vercel-aware logger | `server/logger.ts` | Skips file writes when `process.env.VERCEL` is set |
| SPA fallback rewrite | `vercel.json:6` | `/(.*) → /index.html` prevents 404 on client routes |
| pnpm support | `package.json:23` | `"packageManager": "pnpm@10.20.0"` for Corepack |

## Proposed Solution

Complete the Vercel deployment by addressing the remaining gaps in three phases: critical fixes, environment configuration, and production hardening.

## Technical Considerations

### Architecture

The deployment uses Vercel's hybrid model:
- **Static frontend**: Vite builds to `dist/`, served from Vercel's CDN
- **Serverless API**: `api/index.ts` exports the Express app as a single serverless function
- **Database**: Neon Postgres with serverless driver (already compatible)
- **External APIs**: Anthropic Claude (report generation), Census API, seshat.datasd.org (city data)

### Key Constraints

1. **Vercel Hobby plan**: 10-second function timeout. Pro plan: 60 seconds (300 with streaming)
2. **Ephemeral filesystem**: Serverless functions cannot persist files between invocations
3. **Cold starts**: In-memory caches reset; expensive computations re-run
4. **Single function**: All API routes share one serverless function via Express routing

## System-Wide Impact

- **Interaction graph**: Browser → Vercel CDN (SPA) → Vercel Serverless Function (Express) → Neon Postgres / Claude API / seshat.datasd.org
- **Error propagation**: Missing env vars cause module-level throws (db.ts). DB errors return generic 500s. Claude timeouts may exceed function limits.
- **State lifecycle risks**: File-based report cache writes fail silently on serverless (caught by try/catch in report.ts:183-186). In-memory caches (transit scores, gap analysis) reset on cold starts.
- **API surface parity**: All routes served through single `api/index.ts` entry point — no parity issues.

## Implementation Phases

### Phase 1: Fix Serverless Incompatibilities (Critical)

These changes are required for the deployment to function at all.

#### 1.1 Fix file-based report cache for serverless

**Problem**: `server/services/report-cache.ts` writes to `server/cache/reports/` which is read-only on Vercel. `saveCachedReport()` throws (caught silently), and `getCachedReport()` always returns null.

**Solution**: Make the report cache serverless-aware by falling back gracefully. Accept that on-demand reports won't be cached between invocations in serverless.

```typescript
// server/services/report-cache.ts
const isVercel = !!process.env.VERCEL;

export async function saveCachedReport(community: string, language: string, report: CommunityReport): Promise<void> {
  if (isVercel) {
    // Serverless: no persistent filesystem — skip cache write
    return;
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const filePath = join(CACHE_DIR, cacheKey(community, language));
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}
```

#### 1.2 Handle pre-generated report lookups on serverless

**Problem**: `GET /api/report` reads from `server/cache/reports/` which is empty on Vercel (gitignored). Block-level report lookup (`fs.readdir`) returns empty.

**Solution**: Accept that pre-generated reports are a local-dev optimization. On Vercel, these routes return 404 and the frontend falls back to on-demand generation. No code change needed — the existing error handling already returns 404 gracefully.

#### 1.3 Update CORS for same-origin deployment

**Problem**: Default CORS allows only `localhost:5173` and `localhost:3000`. On Vercel, the SPA and API share the same domain (same-origin), so CORS headers are technically unnecessary. But preview deployments use dynamic URLs that won't match.

**Solution**: Use `VERCEL_URL` env var (auto-set by Vercel) to dynamically allow the current deployment's origin, plus any explicitly configured origins.

```typescript
// server/app.ts — updated CORS config
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];
if (process.env.VERCEL_URL) {
  allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
}
if (allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
}

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
}));
```

### Phase 2: Environment & Configuration

#### 2.1 Set Vercel environment variables

Set these in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Value | Environments |
|----------|-------|-------------|
| `DATABASE_URL` | Neon connection string | Production, Preview |
| `ANTHROPIC_API_KEY` | Anthropic API key | Production, Preview |
| `CENSUS_API_KEY` | Census API key | Production, Preview |
| `CORS_ORIGIN` | Production domain (e.g., `https://block-report.vercel.app`) | Production |

Note: `VERCEL` and `VERCEL_URL` are auto-set by Vercel — no manual configuration needed.

#### 2.2 Update `.env.example` with all variables

```
# .env.example
ANTHROPIC_API_KEY=
CENSUS_API_KEY=
DATABASE_URL=postgresql://user:password@your-project.neon.tech/neondb?sslmode=require
PORT=3001
CORS_ORIGIN=
```

#### 2.3 Configure function settings in `vercel.json`

Add function configuration for appropriate timeout and memory:

```json
{
  "buildCommand": "pnpm db:generate && pnpm build",
  "outputDirectory": "dist",
  "functions": {
    "api/index.ts": {
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Note: `maxDuration: 60` requires Pro plan. On Hobby, this is ignored and the 10s limit applies. Claude API calls typically take 10-30 seconds, so **Pro plan is recommended** for on-demand report generation.

#### 2.4 Ensure `get_community_metrics` stored function exists

**Problem**: The `/api/311` route uses `prisma.$queryRaw` to call a Postgres stored function that isn't managed by Prisma migrations.

**Solution**: Document the manual step. Add a note to README or create a migration script:

```bash
# Run against Neon database to create the stored function
psql $DATABASE_URL -f prisma/functions/get_community_metrics.sql
```

### Phase 3: Production Hardening (Nice-to-Have)

These improve reliability but are not blocking for initial deployment.

#### 3.1 Add health check endpoint

```typescript
// server/app.ts — add before other routes
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});
```

#### 3.2 Document rate limiting limitation

In-memory `express-rate-limit` is ineffective in serverless (each invocation may be a new instance). Options for future improvement:
- Use Upstash Redis (`@upstash/ratelimit`) for distributed rate limiting
- Use Vercel's built-in edge rate limiting (Pro plan)
- Accept the limitation for MVP and monitor Claude API costs

#### 3.3 Consider pre-computing expensive endpoints

Transit scores (`/api/transit`) and gap analysis (`/api/access-gap`) run O(stops × communities) computations on cold starts. Future optimization:
- Pre-compute scores during database seeding and store in a `transit_scores` / `gap_scores` table
- Convert these endpoints to simple Prisma lookups
- This eliminates cold-start latency for the most expensive routes

#### 3.4 Optional: Add Dockerfile for container deployments

For Railway/Render as alternatives to Vercel:

```dockerfile
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate && pnpm build
EXPOSE 3001
CMD ["node", "--import=tsx", "server/index.ts"]
```

This uses the full Express server (not serverless), so file-based caching works normally.

## Alternative Approaches Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Vercel (serverless)** | Free tier, zero config for SPA, auto-preview deploys | Ephemeral filesystem, cold starts, 10s timeout on Hobby | **Chosen** — already partially configured |
| **Railway** | Full server (file cache works), simple Docker deploy | No free tier, no auto-preview per PR | Good fallback |
| **Render** | Free tier, full server support | Slower cold starts, free tier spins down after 15 min inactivity | Alternative |
| **Fly.io** | Full server, persistent volumes, global edge | More complex setup, needs fly.toml | Over-engineered for MVP |

## Acceptance Criteria

### Functional Requirements

- [ ] App loads at a public Vercel URL (SPA renders, React Router works)
- [ ] All API routes respond (`/api/locations/*`, `/api/311`, `/api/demographics`, `/api/report`, `/api/transit`, `/api/access-gap`, `/api/block`)
- [ ] Map renders with Leaflet tiles and marker layers
- [ ] Neighborhood click loads 311 metrics, demographics, transit scores
- [ ] On-demand report generation works via Claude API (Pro plan recommended)
- [ ] Client-side routes (e.g., `/neighborhood/mira-mesa`) don't 404

### Non-Functional Requirements

- [ ] Environment variables set in Vercel dashboard (not in code)
- [ ] No API keys exposed to the browser
- [x] CORS configured for production domain and preview deployments
- [x] Logger uses console-only on Vercel (no file writes)

### Deployment Verification

- [x] `vercel.json` has correct build command, output directory, rewrites, and function config
- [x] `api/index.ts` entry point correctly exports Express app
- [ ] Neon DB connection works from Vercel serverless function
- [ ] `get_community_metrics` stored function exists in production database
- [x] Preview deployments work (CORS allows dynamic Vercel URLs)

## Success Metrics

- App accessible at a public URL without local setup
- All core user flows work: browse map → click neighborhood → view data → generate report
- No API key exposure in browser network tab or source
- Page loads in < 3 seconds (SPA from CDN)
- API responses return in < 5 seconds for data routes (excluding report generation)

## Dependencies & Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Vercel Hobby 10s timeout blocks report generation | HIGH | HIGH (if Hobby) | Use Pro plan or accept reports may timeout |
| Cold start latency for transit/gap endpoints | MEDIUM | HIGH | Accept for MVP; pre-compute later |
| In-memory rate limiting ineffective | MEDIUM | CERTAIN | Monitor Claude API costs; add Upstash later |
| `get_community_metrics` missing on fresh DB | HIGH | MEDIUM | Document manual SQL step; add migration |
| seshat.datasd.org downtime breaks 3 routes | MEDIUM | LOW | Accept; data changes infrequently |
| File-based report cache silently fails | LOW | CERTAIN | Already handled — falls back to on-demand |

## Sources & References

### Internal References

- Existing Vercel config: `vercel.json`
- Serverless entry point: `api/index.ts`
- Express app: `server/app.ts`
- Report cache (serverless-incompatible): `server/services/report-cache.ts`
- Neon DB setup: `server/services/db.ts`
- Logger (Vercel-aware): `server/logger.ts`
- Stored function: `prisma/functions/get_community_metrics.sql`
- Report routes: `server/routes/report.ts`
- Transit computation: `server/routes/transit.ts`
- Gap analysis: `server/services/gap-analysis.ts`

### Related Work

- Commit `6ddb731`: "Add Vercel serverless deployment for Express backend"
- Commit `2060912`: "Add SPA fallback rewrite to fix 404 on client-side routes"
- Commit `ad1d6cc`: "Fix report caching race condition causing redundant Claude API calls"
- Upstream issue: bookchiq/block-report#55
- GitHub issue: makyrie/block-report#10
