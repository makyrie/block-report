// Single source of truth for fetching and caching community boundary GeoJSON

import { join } from 'node:path';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { logger } from '../logger.js';
import { createCachedComputation } from '../utils/cached-computation.js';
import { DISK_CACHE_DIR } from '../env.js';

const BOUNDARY_URL = 'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB safety limit
const DISK_CACHE_PATH = join(DISK_CACHE_DIR, 'boundaries.json');

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

async function computeBoundaries(): Promise<BoundaryCollection> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(BOUNDARY_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to fetch boundaries: ${res.status}`);

    // Guard against unexpectedly large responses (memory exhaustion)
    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new Error(`Boundary response too large: ${contentLength} bytes`);
    }

    // Stream body with incremental size check to avoid buffering oversized payloads
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        reader.cancel();
        throw new Error(`Boundary response body too large: exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));

    const data: unknown = JSON.parse(text);
    if (!validateBoundaryCollection(data)) {
      throw new Error('Invalid boundary GeoJSON: unexpected shape');
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

const cachedBoundaries = createCachedComputation(computeBoundaries, CACHE_TTL, { diskCachePath: DISK_CACHE_PATH });

export function fetchBoundaries(): Promise<BoundaryCollection> {
  return cachedBoundaries.get();
}
