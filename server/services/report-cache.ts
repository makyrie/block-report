import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommunityReport } from '../../src/types/index.js';
import { isVercel } from '../env.js';
import { prisma } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'reports');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(community: string, language: string): string {
  return `${community.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${language.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().trim();
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
    } catch {
      return null;
    }
  }

  try {
    const filePath = join(CACHE_DIR, cacheKey(community, language));
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
    } catch {
      // Best-effort cache — don't fail the request
    }
    return;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  const filePath = join(CACHE_DIR, cacheKey(community, language));
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}
