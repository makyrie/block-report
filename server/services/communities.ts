const NEIGHBORHOODS_URL =
  'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson';
const NEIGHBORHOODS_TTL = 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let neighborhoodsCache: any = null;
let neighborhoodsCachedAt = 0;

export async function getNeighborhoodsGeoJSON(): Promise<{
  features: {
    properties: Record<string, string>;
    geometry: { type: string; coordinates: number[][][] | number[][][][] };
  }[];
}> {
  const now = Date.now();
  if (neighborhoodsCache && now - neighborhoodsCachedAt < NEIGHBORHOODS_TTL) {
    return neighborhoodsCache;
  }

  const response = await fetch(NEIGHBORHOODS_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Failed to fetch boundaries: ${response.status}`);
  const data = await response.json();
  neighborhoodsCache = data;
  neighborhoodsCachedAt = now;
  return data;
}

let communityNamesCache: string[] | null = null;
let communityNamesCachedAt = 0;

export async function getCommunityNames(): Promise<string[]> {
  const now = Date.now();
  if (communityNamesCache && now - communityNamesCachedAt < NEIGHBORHOODS_TTL) {
    return communityNamesCache;
  }

  const geojson = await getNeighborhoodsGeoJSON();
  const names: string[] = [];

  for (const feature of geojson.features) {
    const name: string = feature.properties?.cpname || feature.properties?.name || '';
    if (name) names.push(name.toUpperCase());
  }

  names.sort();
  communityNamesCache = names;
  communityNamesCachedAt = now;
  return names;
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
