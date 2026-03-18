// Shared utility for TTL-cached computations with promise coalescing.
// Replaces the duplicated CACHE_TTL / inflight / cache pattern across services.

export interface CachedComputation<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export function createCachedComputation<T>(
  compute: () => Promise<T>,
  ttlMs: number,
): CachedComputation<T> {
  let cache: T | null = null;
  let cachedAt = 0;
  let inflight: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      const now = Date.now();
      if (cache !== null && now - cachedAt < ttlMs) {
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
