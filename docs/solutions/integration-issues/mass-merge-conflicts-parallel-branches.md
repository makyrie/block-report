---
title: "Resolve 11 Stale PRs with Cascading Merge Conflicts in Parallel-Development Monorepo"
date: 2026-03-24
problem_type: merge_conflict_resolution
component:
  - git
  - monorepo
  - react
  - express
severity: high
symptoms:
  - "11 open PRs all conflicting with main after major refactor"
  - "Branches retained older patterns (pre-custom-hooks, pre-service-extraction)"
  - "Rebase approach abandoned due to 29+ commits per branch causing repeated conflicts"
  - "First-pass merge resolution failed because PRs conflicted with each other"
  - "High-churn files (san-diego-map.tsx, neighborhood-page.tsx, client.ts, gap-analysis.ts) conflicted in nearly every PR"
tags:
  - git
  - merge-conflicts
  - parallel-development
  - monorepo
  - rebase-vs-merge
  - conflict-resolution-strategy
  - incremental-merge
  - react
  - express
  - typescript
related_issues:
  - "main refactor: custom hooks, service extraction, utility consolidation"
  - "parallel workstream divergence (data / map / report tracks)"
  - "cascading conflict order-dependency across open PRs"
related_docs:
  - docs/solutions/integration-issues/choropleth-react-state-leaflet-integration.md
  - docs/solutions/integration-issues/block-level-311-map-markers.md
  - docs/solutions/integration-issues/permit-activity-overlay-full-stack-integration.md
  - docs/solutions/integration-issues/map-layer-filter-review-integration-patterns.md
  - docs/solutions/integration-issues/trends-pipeline-race-conditions-and-validation.md
  - docs/solutions/ui-bugs/map-legend-unavailable-items.md
  - docs/solutions/integration-issues/puppeteer-pdf-generation-express-backend.md
---

# Resolve 11 Stale PRs with Cascading Merge Conflicts

## Problem

11 open PRs in the block-report monorepo (React + Express) all had merge conflicts with main. The branches were parallel feature implementations that diverged significantly while main underwent heavy refactoring:

- Custom hooks extracted (`useMapData`, `useCommunityData`, `useBlockData`)
- Service layer introduced (`server/services/*.ts`)
- Utilities consolidated (`norm()`, `communityKey()`, `validateCommunityParam`)
- Popup components extracted to `popup-content.tsx`

Key hotspot files touched by nearly every branch:
- `src/pages/neighborhood-page.tsx`
- `src/components/map/san-diego-map.tsx`
- `src/api/client.ts`
- `server/routes/gap-analysis.ts`
- `src/types/index.ts`

## Investigation Steps

### 1. Rebase approach (abandoned)

Attempted `git rebase main` on the first branch. The branch had 29 commits, and each commit replayed with conflicts on the same files. After resolving the same `gap-analysis.ts` conflict three times, this approach was abandoned.

### 2. Merge approach (first pass)

Switched to `git merge main --no-edit` which produces a single consolidated conflict set per branch. Resolved all 11 PRs against current main and pushed. However, merging any one PR into main caused the other 10 to conflict again because they all modify the same shared files.

### 3. Resolve-merge-resolve-merge cycle (solution)

Adopted an iterative approach: resolve the smallest PR, user merges it into main, then resolve the next PR against the updated main. Repeat until all PRs are merged.

## Root Cause

Parallel feature development without regular rebasing. The repo's CLAUDE.md specifies "rebase onto main if your branch has drifted" but this wasn't followed, likely due to the hackathon pace. Main advanced through multiple refactoring PRs while 11 feature branches continued building on older patterns.

## Solution

### Strategy

1. **Order PRs by size** (additions ascending) — smaller PRs change fewer files, reducing downstream churn for remaining branches
2. **Merge (not rebase)** — `git merge main --no-edit` produces one conflict set instead of replaying 29+ commits
3. **Prefer main's architecture** for infrastructure code (hooks, services, utilities)
4. **Keep branch's feature additions** on top of main's patterns
5. **Delegate complex PRs** (10+ conflicts) to subagents with full context about main's current state

### Git Commands

```bash
# For each PR, in order:
git checkout main
git pull origin main
git fetch origin ce/feature-branch
git checkout ce/feature-branch
git merge main --no-edit
# resolve conflicts...
git add <resolved-files>
git commit --no-edit
git push --force-with-lease origin ce/feature-branch
# user merges PR, then repeat for next PR
```

### Conflict Resolution Patterns

**Hook extraction conflicts** — branch has inline fetch, main extracted to hook:
```tsx
// Keep main's hook, drop branch's inline pattern
const { metrics, metricsLoading } = useCommunityData(selectedCommunity);
// Add branch's new feature state alongside
const [newFeatureState, setNewFeatureState] = useState(null);
```

**Utility consolidation conflicts** — branch uses inline normalization, main uses utility:
```ts
// Keep main's utility
const key = communityKey(community);  // not community.toUpperCase().trim()
```

**Import conflicts** — merge both sides' imports:
```ts
// Main's existing imports + branch's new feature imports
import { generateReport, getCitywideGaps } from '../api/client';  // main
import { getPermits } from '../api/client';  // branch addition
```

### Merge Order

| Order | PR | Feature | Additions | Conflicts |
|-------|----|---------|-----------|-----------|
| 1 | #20 | Choropleth layer | +797 | 2 files |
| 2 | #23 | Permit overlay | +1043 | 5 files |
| 3 | #28 | Layer filter | +1191 | 6 files |
| 4 | #27 | Legend hiding | +1283 | 13 files |
| 5 | #22 | PDF generation | +1843 | 5 files |
| 6 | #30 | Multilingual flyer | +1486 | 11 files |
| 7 | #24 | 311 trends | +1564 | 9 files |
| 8 | #18 | Block briefs | +1754 | 10 files |
| 9 | #29 | Print flyer FAB | +2863 | 24 files |

PRs #17 (311-on-map) and #21 (MCP server) were merged by the user before the cycle started.

## Prevention Strategies

### Branch Hygiene
- **Rebase every 30-60 minutes** during active development, not just when conflicts appear
- **Short-lived branches** — decompose work into slices mergeable within 1-2 hours
- **Announce shared file edits** before starting work on types, client, or main page components

### Architectural Changes to Reduce Hotspots
- **Split `src/types/index.ts`** by domain (`types/map.ts`, `types/report.ts`, `types/data.ts`)
- **Thin the API client** — base `fetchApi<T>` + per-workstream wrapper modules
- **Keep App.tsx as a pure shell** — route registration only, no feature logic

### CI/CD
- Add a **conflict detection workflow** that runs on push to main and flags open PRs that have become conflicted
- **Require up-to-date branches** in GitHub branch protection settings
- **TypeScript build check** on every PR to catch interface drift early

### Workflow Discipline
- **Merge windows** — synchronize the team every hour: merge ready PRs, everyone rebases
- **Draft PRs early** — gives visibility into which files each branch touches
- **Merge in dependency order** — data workstream first (defines types), then map (consumes types), then report (consumes both)

## Quick Resolution Playbook

When you're already in the situation with N conflicting PRs:

1. **Triage by conflict surface** — branches touching only their own directory can merge immediately
2. **Establish canonical version** of each shared file (usually from the most foundational branch)
3. **Merge smallest-first** — each merge narrows the conflict surface for remaining branches
4. **Use `git merge` not `git rebase`** for branches with many commits
5. **Delegate complex resolutions** with full context about main's current architecture
6. **After the crisis** — split shared files to prevent recurrence
