import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommunityReport } from '../../src/types/index.js';
import { isVercel } from '../env.js';
import { prisma } from './db.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'reports');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Shared key normalization — used by both file-based and DB-based cache paths
 * to ensure the same input produces the same cache key regardless of storage backend.
 */
function normalizeKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cacheFilename(community: string, language: string): string {
  return `${normalizeKey(community)}_${normalizeKey(language)}.json`;
}

export async function getCachedReport(community: string, language: string): Promise<CommunityReport | null> {
  if (isVercel) {
    try {
      const row = await prisma.reportCache.findUnique({
        where: { community_language: { community: normalizeKey(community), language: normalizeKey(language) } },
      });
      if (!row) return null;
      const age = Date.now() - row.createdAt.getTime();
      if (age > CACHE_TTL_MS) return null;
      return row.report as unknown as CommunityReport;
    } catch (err) {
      logger.error('Failed to read report cache from DB', {
        error: err instanceof Error ? err.message : String(err),
        community,
        language,
      });
      return null;
    }
  }

  try {
    const filePath = join(CACHE_DIR, cacheFilename(community, language));
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as CommunityReport;
  } catch {
    return null;
  }
}

export async function saveCachedReport(community: string, language: string, report: CommunityReport): Promise<void> {
  if (isVercel) {
    try {
      await prisma.reportCache.upsert({
        where: { community_language: { community: normalizeKey(community), language: normalizeKey(language) } },
        update: { report: report as unknown as Record<string, unknown>, createdAt: new Date() },
        create: { community: normalizeKey(community), language: normalizeKey(language), report: report as unknown as Record<string, unknown> },
      });
    } catch (err) {
      logger.error('Failed to write report cache to DB', {
        error: err instanceof Error ? err.message : String(err),
        community,
        language,
      });
    }
    return;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  const filePath = join(CACHE_DIR, cacheFilename(community, language));
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}

/**
 * DB-backed rate limit check for report generation.
 * Counts reports created in the last windowMs. Works across serverless instances.
 * Returns true if the limit has been exceeded.
 */
const GENERATION_RATE_LIMIT = 20; // max reports per window
const GENERATION_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function isGenerationRateLimited(): Promise<boolean> {
  if (!isVercel) return false; // Local dev doesn't need this

  try {
    const since = new Date(Date.now() - GENERATION_RATE_WINDOW_MS);
    const count = await prisma.reportCache.count({
      where: { createdAt: { gte: since } },
    });
    return count >= GENERATION_RATE_LIMIT;
  } catch (err) {
    logger.error('Rate limit check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail open — don't block if check fails
    return false;
  }
}

/**
 * Delete stale cache rows older than the TTL.
 * Called periodically to prevent unbounded table growth.
 */
export async function purgeStaleCache(): Promise<number> {
  if (!isVercel) return 0;

  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);
    const result = await prisma.reportCache.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      logger.info('Purged stale report cache rows', { count: result.count });
    }
    return result.count;
  } catch (err) {
    logger.error('Failed to purge stale report cache', {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
