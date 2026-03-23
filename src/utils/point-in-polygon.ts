// Re-exports shared point-in-polygon utilities and adds the
// findCommunityAtPoint helper specific to the frontend.

import type { FeatureCollection } from 'geojson';
import { pointInGeometry } from '../../types/geo';

export { pointInGeometry };

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
    if (pointInGeometry(lng, lat, feature.geometry)) {
      // Try common property names for community name
      const props = feature.properties;
      if (!props) continue;
      const name = props.cpname || props.community || props.name || props.NAME || props.COMMUNITY;
      if (name) return name as string;
    }
  }
  return null;
}
