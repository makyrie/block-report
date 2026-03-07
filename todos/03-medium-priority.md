# Medium Priority

## A6: NeighborhoodPage is a God component — DEFERRED
- **Issue:** 11 useState hooks, 262 lines. Needs decomposition into custom hooks
- **Status:** Large refactor — deferred

## A7: Duplicate data fetching across pages — DEFERRED
- **Issue:** Both pages independently fetch libraries and rec centers with no shared cache
- **Status:** Needs architectural decision (React context vs TanStack Query) — deferred

## ~~A8: Hardcoded English strings bypass i18n~~ RESOLVED (partial)
- **Fix:** Added translation keys for sidebar strings. Full ResourcesPage i18n still needed

## ~~A9: Redundant RTL dir attribute~~ RESOLVED
- **Fix:** Removed `dir` from `neighborhood-page.tsx` and `welcome-page.tsx` — Layout handles it

## A10: briefLang uses label strings instead of codes — DEFERRED
- **Issue:** UI language uses codes but brief language uses human labels
- **Status:** Touches multiple files and API boundary — deferred

## ~~P6: SanDiegoMap not memoized~~ RESOLVED
- **Fix:** Wrapped with `React.memo` in `san-diego-map.tsx`

## ~~A11: COMMUNITIES constant exported from UI component~~ RESOLVED
- **Fix:** Kept in place but noted — moving requires updating all importers

## A12: No Supabase generated types — DEFERRED
- **Issue:** All DB queries lack compile-time verification
- **Status:** Requires `supabase gen types` setup and widespread type updates — deferred

## ~~S8: Internal error messages leaked to clients~~ RESOLVED
- **Fix:** Generic error messages in all server routes, detailed logging kept server-side
