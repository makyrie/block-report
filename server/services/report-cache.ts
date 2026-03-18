import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommunityReport } from '../../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'reports');
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

function sanitizeKeyPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function cacheKey(community: string, language: string): string {
  return `${sanitizeKeyPart(community)}_${sanitizeKeyPart(language)}.json`;
}

/** Build a deterministic cache key for address block reports */
export function buildBlockCacheKey(lat: number, lng: number, radius: number, langCode: string): string {
  const safeLat = Number(lat).toFixed(4);
  const safeLng = Number(lng).toFixed(4);
  const safeRadius = Math.min(2, Math.max(0.1, Number(radius) || 0.25));
  const safeLang = sanitizeKeyPart(langCode);
  return `addr_${safeLat}_${safeLng}_${safeRadius}_${safeLang}`;
}

export async function getCachedReportByKey(key: string): Promise<CommunityReport | null> {
  try {
    const filePath = join(CACHE_DIR, `${sanitizeKeyPart(key)}.json`);
    const raw = await readFile(filePath, 'utf-8');
    const report: CommunityReport = JSON.parse(raw);
    return report;
  } catch {
    return null;
  }
}

export async function saveCachedReportByKey(key: string, report: CommunityReport): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const filePath = join(CACHE_DIR, `${sanitizeKeyPart(key)}.json`);
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}

export async function getCachedReport(community: string, language: string): Promise<CommunityReport | null> {
  try {
    const filePath = join(CACHE_DIR, cacheKey(community, language));
    const raw = await readFile(filePath, 'utf-8');
    const report: CommunityReport = JSON.parse(raw);

    // Check staleness — still return stale reports but mark them
    const age = Date.now() - new Date(report.generatedAt).getTime();
    if (age > STALE_THRESHOLD_MS) {
      // Return stale report — caller can decide to regenerate in background
      return report;
    }

    return report;
  } catch {
    return null;
  }
}

export async function saveCachedReport(community: string, language: string, report: CommunityReport): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const filePath = join(CACHE_DIR, cacheKey(community, language));
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}
