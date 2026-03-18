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

export async function fetchBoundaries(): Promise<BoundaryCollection> {
  const now = Date.now();
  if (boundaryCache && now - boundaryCache.cachedAt < CACHE_TTL) {
    return boundaryCache.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(BOUNDARY_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to fetch boundaries: ${res.status}`);
    const data = await res.json();
    boundaryCache = { data, cachedAt: now };
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
