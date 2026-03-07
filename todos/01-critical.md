# Critical / Must-Fix

## ~~S1: Hardcoded Census API key~~ RESOLVED
- **Fix:** Replaced real key with placeholder in `.env.example`

## ~~S2: Open CORS~~ RESOLVED
- **Fix:** Restricted to localhost origins in `server/index.ts`

## ~~S3: No rate limiting~~ RESOLVED
- **Fix:** Added `express-rate-limit` — 100/15min general, 10/15min for `/api/brief`

## ~~S4: Prompt injection~~ RESOLVED
- **Fix:** Added communityName validation (type, length, control char stripping) in `server/services/claude.ts`

## ~~S5: SECURITY DEFINER truncate function exposed~~ RESOLVED
- **Fix:** Added `REVOKE EXECUTE` in migration file

## ~~P1: Unbounded SELECT * on requests_311~~ RESOLVED
- **Fix:** Select only needed columns in `server/routes/metrics.ts`

## ~~P2: ~4,000 transit stop markers rendered individually~~ RESOLVED
- **Fix:** Added `preferCanvas={true}` to MapContainer

## P3: Demographics community-based query is broken — DEFERRED
- **Where:** `server/routes/demographics.ts:81` vs migration schema
- **Issue:** `census_language` table has no `community` column — needs DB migration and seed update
- **Status:** Requires database schema change — too large for parallel resolution
