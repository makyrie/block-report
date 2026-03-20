import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommunityReport } from '../../src/types/index.js';
import { isVercel } from '../env.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'reports');
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(community: string, language: string): string {
  return `${community.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${language.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
}

export async function getCachedReport(community: string, language: string): Promise<CommunityReport | null> {
  if (isVercel) {
    // Serverless: no persistent filesystem — cache unavailable
    return null;
  }
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
  if (isVercel) {
    // Serverless: no persistent filesystem — skip cache write
    return;
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const filePath = join(CACHE_DIR, cacheKey(community, language));
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
}
