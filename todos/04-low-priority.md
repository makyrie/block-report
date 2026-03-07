# Low Priority / Polish

## ~~Q1: Unused accessGapScore field~~ RESOLVED
- **Fix:** Removed from `src/types/index.ts`

## ~~Q2: Dead CSS class~~ RESOLVED
- **Fix:** Removed `.leaflet-marker-green` from `src/app.css`

## ~~Q3: csv-parse as production dependency~~ RESOLVED
- **Fix:** Moved to `devDependencies` in `package.json`

## ~~Q4: Anthropic client re-instantiated per request~~ RESOLVED
- **Fix:** Lazy singleton pattern in `server/services/claude.ts`

## ~~Q5: Inconsistent export pattern for BriefDisplay~~ RESOLVED
- **Fix:** Changed to default export in `brief-display.tsx`

## Q6: ESLint exhaustive-deps suppressed — DEFERRED
- **Where:** `src/pages/neighborhood-page.tsx:50`
- **Status:** Needs careful refactor to eliminate stale closure risk — deferred

## ~~Q7: Duplicate language selector UI~~ RESOLVED (noted)
- **Status:** Both selectors serve different purposes (UI lang vs brief lang) — acceptable

## Q8: selectedAnchor state is underutilized — DEFERRED
- **Where:** `src/pages/neighborhood-page.tsx:34`
- **Status:** Part of larger NeighborhoodPage refactor — deferred

## ~~Q9: neighborhoodsCache typed as unknown~~ RESOLVED
- **Fix:** Typed as `Record<string, unknown> | null` in `server/routes/locations.ts`

## Q10: Server types cross-reference src/types/ — DEFERRED
- **Issue:** Server imports from `../../src/types/index.js`
- **Status:** Needs shared types directory — architectural change deferred
