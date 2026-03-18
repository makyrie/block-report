// Single source of truth for fetching and caching community boundary GeoJSON

const BOUNDARY_URL = 'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson';
const CACHE_TTL = 24 * 60 * 60 * 1000;

export interface BoundaryFeature {
  properties: Record<string, string>;
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}

export interface BoundaryCollection {
  features: BoundaryFeature[];
}

let boundaryCache: { data: BoundaryCollection; cachedAt: number } | null = null;

function validateBoundaryCollection(data: unknown): data is BoundaryCollection {
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
    if (!Array.isArray(geom.coordinates)) return false;
  }
  return true;
}

let inflight: Promise<BoundaryCollection> | null = null;

export async function fetchBoundaries(): Promise<BoundaryCollection> {
  const now = Date.now();
  if (boundaryCache && now - boundaryCache.cachedAt < CACHE_TTL) {
    return boundaryCache.data;
  }

  // Promise coalescing: reuse in-flight fetch for concurrent callers
  if (!inflight) {
    inflight = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(BOUNDARY_URL, { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to fetch boundaries: ${res.status}`);
        const data: unknown = await res.json();
        if (!validateBoundaryCollection(data)) {
          throw new Error('Invalid boundary GeoJSON: unexpected shape');
        }
        boundaryCache = { data, cachedAt: Date.now() };
        return data;
      } finally {
        clearTimeout(timeout);
      }
    })().then((result) => {
      inflight = null;
      return result;
    }).catch((err) => {
      inflight = null;
      throw err;
    });
  }
  return inflight;
}
