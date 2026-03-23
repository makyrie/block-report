// Shared utility for TTL-cached computations with promise coalescing.
// Supports optional disk cache for serverless cold-start resilience.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { logger } from '../logger.js';

export interface CachedComputation<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export interface CachedComputationOptions {
  /** Path to a JSON file for disk-based cache persistence (survives cold starts) */
  diskCachePath?: string;
}

export function createCachedComputation<T>(
  compute: () => Promise<T>,
  ttlMs: number,
  options?: CachedComputationOptions,
): CachedComputation<T> {
  let cache: T | null = null;
  let cachedAt = 0;
  let inflight: Promise<T> | null = null;

  async function readDisk(): Promise<T | null> {
    if (!options?.diskCachePath) return null;
    try {
      const raw = await readFile(options.diskCachePath, 'utf-8');
      const envelope = JSON.parse(raw) as { cachedAt: number; data: T };
      if (Date.now() - envelope.cachedAt < ttlMs) {
        return envelope.data;
      }
    } catch {
      // No disk cache or corrupt — fall through
    }
    return null;
  }

  async function writeDisk(data: T): Promise<void> {
    if (!options?.diskCachePath) return;
    try {
      await mkdir(dirname(options.diskCachePath), { recursive: true });
      const tmpFile = options.diskCachePath + '.tmp';
      await writeFile(tmpFile, JSON.stringify({ cachedAt: Date.now(), data }));
      await rename(tmpFile, options.diskCachePath);
    } catch (err) {
      logger.warn('Failed to write disk cache', { error: (err as Error).message });
    }
  }

  return {
    get(): Promise<T> {
      const now = Date.now();
      if (cache !== null && now - cachedAt < ttlMs) {
        return Promise.resolve(cache);
      }
      if (!inflight) {
        inflight = (async () => {
          // Try disk cache before recomputing
          const diskResult = await readDisk();
          if (diskResult !== null) {
            cache = diskResult;
            cachedAt = Date.now();
            inflight = null;
            return diskResult;
          }

          const result = await compute();
          cache = result;
          cachedAt = Date.now();
          inflight = null;
          // Persist to disk in background
          writeDisk(result).catch(() => {});
          return result;
        })().catch((err) => {
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
