# High Priority

## A1: CLAUDE.md is stale — DEFERRED
- **Issue:** Documents files that no longer exist (cache.ts, soda.ts, census.ts, App.tsx)
- **Status:** Requires careful rewrite to reflect current architecture — deferred

## ~~A2: getTransitStops() returns Promise<unknown[]>~~ RESOLVED
- **Fix:** Return type changed to `Promise<TransitStop[]>` in `src/api/client.ts`

## ~~A3: Duplicate TransitStop interface~~ RESOLVED
- **Fix:** Consolidated to `src/types/index.ts`, removed from neighborhood-page and san-diego-map

## ~~A4: No React error boundaries~~ RESOLVED
- **Fix:** Created `src/components/ui/error-boundary.tsx`, wrapped `<Outlet />` in Layout

## ~~A5: .catch(console.error) on data-fetching calls~~ RESOLVED
- **Fix:** Added `dataError` state and error banner in `neighborhood-page.tsx`

## ~~P4: SELECT * on transit_stops over-fetches~~ RESOLVED
- **Fix:** `.select('objectid, stop_name, lat, lng')` in `server/routes/locations.ts`

## ~~P5: Synchronous file I/O in logger~~ RESOLVED
- **Fix:** Replaced `appendFileSync` with `createWriteStream` in `server/logger.ts`

## ~~S6: No input validation on community query param~~ RESOLVED
- **Fix:** Added wildcard stripping and length validation in metrics and demographics routes

## ~~S7: No security headers~~ RESOLVED
- **Fix:** Added `helmet()` middleware in `server/index.ts`
