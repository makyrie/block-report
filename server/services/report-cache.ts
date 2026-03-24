import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommunityReport } from '../../src/types/index.js';
import { isVercel } from '../env.js';
import { prisma } from './db.js';
import { logger } from '../logger.js';
import { communityKey } from '../utils/community.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'reports');
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Filesystem/DB-safe cache key: derives from communityKey() (the canonical
 * UPPERCASE normalizer), then lowercases and converts spaces/punctuation to dashes.
 * This ensures cache keys stay consistent with the server-side community lookup maps.
 */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Build a deterministic cache key for address block reports */
export function buildBlockCacheKey(lat: number, lng: number, radius: number, langCode: string): string {
  const safeLat = Number(lat).toFixed(4);
  const safeLng = Number(lng).toFixed(4);
  const safeRadius = Math.min(2, Math.max(0.1, Number(radius) || 0.25));
  const safeLang = normalizeKey(langCode);
  return `addr_${safeLat}_${safeLng}_${safeRadius}_${safeLang}`;
}

// ---------------------------------------------------------------------------
// Cache strategy abstraction — eliminates isVercel branching in every function
// ---------------------------------------------------------------------------

interface CacheStrategy {
  get(community: string, language: string): Promise<CommunityReport | null>;
  set(community: string, language: string, report: CommunityReport): Promise<void>;
  countRecent(sinceMs: number): Promise<number>;
  purgeStale(): Promise<number>;
}

/** Database-backed cache for serverless (Vercel/Neon) */
const dbStrategy: CacheStrategy = {
  async get(community, language) {
    const row = await prisma.reportCache.findUnique({
      where: { community_language: { community: normalizeKey(community), language: normalizeKey(language) } },
    });
    if (!row) return null;
    const age = Date.now() - row.createdAt.getTime();
    if (age > CACHE_TTL_MS) return null;
    return row.report as unknown as CommunityReport;
  },

  async set(community, language, report) {
    await prisma.reportCache.upsert({
      where: { community_language: { community: normalizeKey(community), language: normalizeKey(language) } },
      update: { report: report as unknown as Record<string, unknown>, createdAt: new Date() },
      create: { community: normalizeKey(community), language: normalizeKey(language), report: report as unknown as Record<string, unknown> },
    });
  },

  async countRecent(sinceMs) {
    const since = new Date(Date.now() - sinceMs);
    return prisma.reportCache.count({ where: { createdAt: { gte: since } } });
  },

  async purgeStale() {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);
    const result = await prisma.reportCache.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  },
};

/** File-based cache for local development */
const fileStrategy: CacheStrategy = {
  async get(community, language) {
    const filePath = join(CACHE_DIR, `${normalizeKey(community)}_${normalizeKey(language)}.json`);
    try {
      // Enforce TTL on file cache — don't serve stale files indefinitely
      const fileStat = await stat(filePath);
      const age = Date.now() - fileStat.mtimeMs;
      if (age > CACHE_TTL_MS) return null;

      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as CommunityReport;
    } catch {
      return null;
    }
  },

  async set(community, language, report) {
    await mkdir(CACHE_DIR, { recursive: true });
    const filePath = join(CACHE_DIR, `${normalizeKey(community)}_${normalizeKey(language)}.json`);
    const tmpPath = filePath + '.tmp';
    await writeFile(tmpPath, JSON.stringify(report), 'utf-8');
    await rename(tmpPath, filePath);
  },

  async countRecent() {
    logger.warn('Rate limiting is not enforced in local file-based mode');
    return 0;
  },

  async purgeStale() {
    return 0; // File cleanup not needed locally
  },
};

const strategy: CacheStrategy = isVercel ? dbStrategy : fileStrategy;

// ---------------------------------------------------------------------------
// Public API — delegates to the active strategy
// ---------------------------------------------------------------------------

export async function getCachedReport(community: string, language: string): Promise<CommunityReport | null> {
  try {
    return await strategy.get(community, language);
  } catch (err) {
    logger.error('Failed to read report cache', {
      error: err instanceof Error ? err.message : String(err),
      community,
      language,
    });
    return null;
  }
}

export async function saveCachedReport(community: string, language: string, report: CommunityReport): Promise<void> {
  try {
    await strategy.set(community, language, report);
  } catch (err) {
    logger.error('Failed to write report cache', {
      error: err instanceof Error ? err.message : String(err),
      community,
      language,
    });
  }
}

// ---------------------------------------------------------------------------
// Block report cache — reuses the same strategy with a "block:" key prefix
// ---------------------------------------------------------------------------

function blockCacheKey(anchorId: string): string {
  return `blkreport-${normalizeKey(anchorId)}`;
}

export async function getCachedBlockReport(anchorId: string, language: string): Promise<CommunityReport | null> {
  try {
    return await strategy.get(blockCacheKey(anchorId), language);
  } catch (err) {
    logger.error('Failed to read block report cache', {
      error: err instanceof Error ? err.message : String(err),
      anchorId,
      language,
    });
    return null;
  }
}

export async function saveCachedBlockReport(anchorId: string, language: string, report: CommunityReport): Promise<void> {
  try {
    await strategy.set(blockCacheKey(anchorId), language, report);
  } catch (err) {
    logger.error('Failed to write block report cache', {
      error: err instanceof Error ? err.message : String(err),
      anchorId,
      language,
    });
  }
}

/** Get a cached report by an arbitrary key (used for address block reports) */
export async function getCachedReportByKey(key: string): Promise<CommunityReport | null> {
  try {
    return await strategy.get(key, 'default');
  } catch (err) {
    logger.error('Failed to read report cache by key', {
      error: err instanceof Error ? err.message : String(err),
      key,
    });
    return null;
  }
}

/** Save a cached report by an arbitrary key (used for address block reports) */
export async function saveCachedReportByKey(key: string, report: CommunityReport): Promise<void> {
  try {
    await strategy.set(key, 'default', report);
  } catch (err) {
    logger.error('Failed to write report cache by key', {
      error: err instanceof Error ? err.message : String(err),
      key,
    });
  }
}

/**
 * DB-backed rate limit check for report generation.
 * Counts reports created in the last windowMs. Works across serverless instances.
 * Returns true if the limit has been exceeded.
 */
const GENERATION_RATE_LIMIT = 20; // max reports per window
const GENERATION_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * In-memory generation attempt tracker — counts attempts, not just successful cache writes.
 * Closes the gap where failed Claude API calls don't increment the DB-backed count,
 * preventing cost exposure from repeated failing requests.
 *
 * Limitation: resets on serverless cold start. The DB-backed countRecent() check
 * provides cross-instance protection for successful generations. For failed attempts,
 * express-rate-limit (also in-memory) provides a first line of defense. Production
 * deployments should use Vercel WAF or Upstash Redis for durable rate limiting.
 */
const attemptTimestamps: number[] = [];

export function recordGenerationAttempt(): void {
  const cutoff = Date.now() - GENERATION_RATE_WINDOW_MS;
  // Evict expired entries
  while (attemptTimestamps.length > 0 && attemptTimestamps[0] < cutoff) {
    attemptTimestamps.shift();
  }
  attemptTimestamps.push(Date.now());
}

export async function isGenerationRateLimited(): Promise<boolean> {
  try {
    // Check in-memory attempts first — catches failed generations that never wrote to DB
    const cutoff = Date.now() - GENERATION_RATE_WINDOW_MS;
    while (attemptTimestamps.length > 0 && attemptTimestamps[0] < cutoff) {
      attemptTimestamps.shift();
    }
    if (attemptTimestamps.length >= GENERATION_RATE_LIMIT) {
      return true;
    }

    // Also check DB — catches attempts from other serverless instances
    const count = await strategy.countRecent(GENERATION_RATE_WINDOW_MS);
    return count >= GENERATION_RATE_LIMIT;
  } catch (err) {
    logger.error('Rate limit check failed — failing closed to protect Claude API budget', {
      error: err instanceof Error ? err.message : String(err),
    });
    return true; // Fail closed: block generation if we can't verify the rate limit
  }
}

/**
 * Delete stale cache rows older than the TTL.
 * Called periodically via cron to prevent unbounded table growth.
 */
export async function purgeStaleCache(): Promise<number> {
  try {
    const count = await strategy.purgeStale();
    if (count > 0) {
      logger.info('Purged stale report cache rows', { count });
    }
    return count;
  } catch (err) {
    logger.error('Failed to purge stale report cache', {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
