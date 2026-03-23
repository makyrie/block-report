// Shared utility for TTL-cached computations with promise coalescing.
// Replaces the duplicated CACHE_TTL / inflight / cache pattern across services.

import { isVercel } from '../env.js';

// On serverless (Vercel), instances are ephemeral — long TTLs waste memory
// since the cache rarely survives long enough to benefit from 24h retention.
const SERVERLESS_MAX_TTL = 5 * 60 * 1000; // 5 minutes

export interface CachedComputation<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export function createCachedComputation<T>(
  compute: () => Promise<T>,
  ttlMs: number,
): CachedComputation<T> {
  const effectiveTtl = isVercel ? Math.min(ttlMs, SERVERLESS_MAX_TTL) : ttlMs;
  let cache: T | null = null;
  let cachedAt = 0;
  let inflight: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      const now = Date.now();
      if (cache !== null && now - cachedAt < effectiveTtl) {
        return Promise.resolve(cache);
      }
      if (!inflight) {
        inflight = compute()
          .then((result) => {
            cache = result;
            cachedAt = Date.now();
            inflight = null;
            return result;
          })
          .catch((err) => {
            inflight = null;
            throw err;
          });
      }
      return inflight;
    },
    invalidate(): void {
      cache = null;
      cachedAt = 0;
    },
  };
}
