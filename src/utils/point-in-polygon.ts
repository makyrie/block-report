import type { FeatureCollection } from 'geojson';
import { pointInFeature } from './geo';
import type { PolygonLike } from './geo';

/**
 * Given a lat/lng and the neighborhoods GeoJSON FeatureCollection,
 * return the community name that contains the point, or null if outside all boundaries.
 */
export function findCommunityAtPoint(
  lat: number,
  lng: number,
  boundaries: FeatureCollection,
): string | null {
  for (const feature of boundaries.features) {
    if (!feature.geometry) continue;
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue;
    if (pointInFeature(lat, lng, feature.geometry as PolygonLike)) {
      const props = feature.properties;
      if (!props) continue;
      const name = props.cpname || props.community || props.name || props.NAME || props.COMMUNITY;
      if (name) return name as string;
    }
  }
  return null;
}
