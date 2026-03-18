// Single source of truth for fetching and caching community boundary GeoJSON

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { logger } from '../logger.js';
import { createCachedComputation } from '../utils/cached-computation.js';

const BOUNDARY_URL = 'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const DISK_CACHE_DIR = join(process.cwd(), 'server', 'cache');
const DISK_CACHE_FILE = join(DISK_CACHE_DIR, 'boundaries.json');

export type BoundaryFeature = Feature<Polygon | MultiPolygon>;
export type BoundaryCollection = FeatureCollection<Polygon | MultiPolygon>;

export function validateBoundaryCollection(data: unknown): data is BoundaryCollection {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.features)) return false;
  for (const f of obj.features) {
    if (typeof f !== 'object' || f === null) return false;
    const feat = f as Record<string, unknown>;
    if (typeof feat.properties !== 'object' || feat.properties === null) return false;
    if (typeof feat.geometry !== 'object' || feat.geometry === null) return false;
    const geom = feat.geometry as Record<string, unknown>;
    if (typeof geom.type !== 'string') return false;
    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return false;
    if (!Array.isArray(geom.coordinates)) return false;
  }
  return true;
}

async function readDiskCache(): Promise<BoundaryCollection | null> {
  try {
    const raw = await readFile(DISK_CACHE_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'cachedAt' in parsed && 'data' in parsed) {
      const envelope = parsed as { cachedAt: number; data: unknown };
      if (Date.now() - envelope.cachedAt < CACHE_TTL && validateBoundaryCollection(envelope.data)) {
        return envelope.data;
      }
    }
  } catch {
    // No disk cache or corrupt — fall through to network fetch
  }
  return null;
}

async function writeDiskCache(data: BoundaryCollection): Promise<void> {
  try {
    await mkdir(DISK_CACHE_DIR, { recursive: true });
    await writeFile(DISK_CACHE_FILE, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch (err) {
    logger.warn('Failed to write boundary disk cache', { error: (err as Error).message });
  }
}

async function computeBoundaries(): Promise<BoundaryCollection> {
  // Try disk cache before network
  const diskData = await readDiskCache();
  if (diskData) {
    logger.info('Loaded boundary GeoJSON from disk cache');
    return diskData;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(BOUNDARY_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to fetch boundaries: ${res.status}`);
    const data: unknown = await res.json();
    if (!validateBoundaryCollection(data)) {
      throw new Error('Invalid boundary GeoJSON: unexpected shape');
    }
    // Persist to disk for cold-start resilience
    await writeDiskCache(data);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

const cachedBoundaries = createCachedComputation(computeBoundaries, CACHE_TTL);

export function fetchBoundaries(): Promise<BoundaryCollection> {
  return cachedBoundaries.get();
}
