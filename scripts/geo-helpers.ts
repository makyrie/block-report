// Shared helpers for seed scripts — keeps seed.ts and map-tracts.ts DRY

import { pointInPolygon } from '../server/utils/geo.js';
import { titleCase } from '../types/community.js';

export type Polygon = number[][][]; // [ring][point][lng, lat]

export interface CommunityFeature {
  name: string;
  polygons: Polygon[];
}

// Re-export shared titleCase as toTitleCase for backwards compatibility
export const toTitleCase = titleCase;

export function findCommunity(lat: number, lng: number, communities: CommunityFeature[]): string | null {
  for (const c of communities) {
    for (const poly of c.polygons) {
      if (pointInPolygon(lat, lng, poly[0])) return c.name;
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
