const NEIGHBORHOODS_URL =
  'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson';
const NEIGHBORHOODS_TTL = 24 * 60 * 60 * 1000;

type NeighborhoodsGeoJSON = {
  features: {
    properties: Record<string, string>;
    geometry: { type: string; coordinates: number[][][] | number[][][][] };
  }[];
};

let neighborhoodsCache: NeighborhoodsGeoJSON | null = null;
let neighborhoodsCachedAt = 0;
let inflightFetch: Promise<NeighborhoodsGeoJSON> | null = null;

export async function getNeighborhoodsGeoJSON(): Promise<NeighborhoodsGeoJSON> {
  const now = Date.now();
  if (neighborhoodsCache && now - neighborhoodsCachedAt < NEIGHBORHOODS_TTL) {
    return neighborhoodsCache;
  }
  if (inflightFetch) {
    return inflightFetch;
  }

  inflightFetch = fetch(NEIGHBORHOODS_URL, { signal: AbortSignal.timeout(30_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Failed to fetch boundaries: ${response.status}`);
      const data = await response.json();
      neighborhoodsCache = data;
      neighborhoodsCachedAt = Date.now();
      return data;
    })
    .finally(() => {
      inflightFetch = null;
    });

  return inflightFetch;
}

export async function getCommunityNames(): Promise<string[]> {
  const geojson = await getNeighborhoodsGeoJSON();
  const names: string[] = [];

  for (const feature of geojson.features) {
    const name: string = feature.properties?.cpname || feature.properties?.name || '';
    if (name) names.push(name.toUpperCase());
  }

  return names.sort();
}

export function normalizeCommunityName(input: string): string {
  return input.toUpperCase().trim().replace(/[%_]/g, '');
}

export async function validateCommunityName(input: string): Promise<{ valid: boolean; normalized: string; names: string[] }> {
  const normalized = normalizeCommunityName(input);
  const names = await getCommunityNames();
  return {
    valid: names.includes(normalized),
    normalized,
    names,
  };
}
