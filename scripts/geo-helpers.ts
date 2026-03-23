// Shared helpers for seed scripts — keeps seed.ts and map-tracts.ts DRY

import { pointInPolygon } from '../server/utils/geo.js';

export type Polygon = number[][][]; // [ring][point][lng, lat]

export interface CommunityFeature {
  name: string;
  polygons: Polygon[];
}

// Canonical title-case — matches src/utils/community.ts titleCase()
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(^|\s|[-:])(\w)/g, (_, sep, char) => sep + char.toUpperCase());
}

export function findCommunity(lat: number, lng: number, communities: CommunityFeature[]): string | null {
  for (const c of communities) {
    for (const poly of c.polygons) {
      const [outer, ...holes] = poly;
      if (!pointInPolygon(lat, lng, outer)) continue;
      let inHole = false;
      for (const hole of holes) {
        if (pointInPolygon(lat, lng, hole)) { inHole = true; break; }
      }
      if (!inHole) return c.name;
    }
  }
  return null;
}

export function parseCommunityFeatures(boundaries: { features: Array<{ properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }> }): CommunityFeature[] {
  const communities: CommunityFeature[] = [];
  for (const feature of boundaries.features) {
    const name = toTitleCase((feature.properties.cpname || feature.properties.name || '').trim());
    if (!name) continue;
    const geom = feature.geometry;
    const polygons: Polygon[] =
      geom.type === 'MultiPolygon' ? geom.coordinates as Polygon[] : [geom.coordinates as Polygon];
    communities.push({ name, polygons });
  }
  return communities;
}
