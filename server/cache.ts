import { createHash } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const CACHE_DIR = './server/cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function keyToPath(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex');
  return join(CACHE_DIR, `${hash}.json`);
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await readFile(keyToPath(key), 'utf-8');
    const entry = JSON.parse(raw) as { timestamp: number; data: T };
    if (Date.now() - entry.timestamp > CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCache(key: string, data: unknown): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry = { timestamp: Date.now(), data };
  await writeFile(keyToPath(key), JSON.stringify(entry));
}
