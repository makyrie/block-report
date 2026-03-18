import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommunityReport } from '../../src/types/index.js';
import { sanitizeFilename } from '../utils/language.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'reports');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Ensure cache directory exists once at module init
const _ensureDir = mkdir(CACHE_DIR, { recursive: true }).catch(() => {});

function cacheKey(community: string, language: string): string {
  return `${sanitizeFilename(community)}_${sanitizeFilename(language)}.json`;
}

/** Build a deterministic cache key for address block reports */
export function buildBlockCacheKey(lat: number, lng: number, radius: number, langCode: string): string {
  const safeLat = Number(lat).toFixed(4);
  const safeLng = Number(lng).toFixed(4);
  const safeRadius = Math.min(2, Math.max(0.1, Number(radius) || 0.25));
  const safeLang = sanitizeFilename(langCode);
  return `addr_${safeLat}_${safeLng}_${safeRadius}_${safeLang}`;
}

export async function getCachedReportByKey(key: string): Promise<CommunityReport | null> {
  try {
    const filePath = join(CACHE_DIR, `${sanitizeFilename(key)}.json`);
    const raw = await readFile(filePath, 'utf-8');
    const report: CommunityReport = JSON.parse(raw);
    // Enforce TTL — ignore stale cached reports
    const age = Date.now() - new Date(report.generatedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return report;
  } catch {
    return null;
  }
}

export async function saveCachedReportByKey(key: string, report: CommunityReport): Promise<void> {
  await _ensureDir;
  const filePath = join(CACHE_DIR, `${sanitizeFilename(key)}.json`);
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}

export async function getCachedReport(community: string, language: string): Promise<CommunityReport | null> {
  try {
    const filePath = join(CACHE_DIR, cacheKey(community, language));
    const raw = await readFile(filePath, 'utf-8');
    const report: CommunityReport = JSON.parse(raw);
    // Enforce TTL — ignore stale cached reports
    const age = Date.now() - new Date(report.generatedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return report;
  } catch {
    return null;
  }
}

export async function saveCachedReport(community: string, language: string, report: CommunityReport): Promise<void> {
  await _ensureDir;
  const filePath = join(CACHE_DIR, cacheKey(community, language));
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}
