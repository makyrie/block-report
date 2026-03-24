import type { FeatureCollection, Geometry, Position } from 'geojson';

/**
 * Ray-casting point-in-polygon test.
 * Parameters: (lat, lng) — matches server/utils/geo.ts convention.
 * Ring coordinates follow GeoJSON convention: [lng, lat] pairs.
 */
function pointInRing(lat: number, lng: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [pLng_i, pLat_i] = ring[i]; // GeoJSON: [lng, lat]
    const [pLng_j, pLat_j] = ring[j];
    if ((pLat_i > lat) !== (pLat_j > lat) && lng < ((pLng_j - pLng_i) * (lat - pLat_i)) / (pLat_j - pLat_i) + pLng_i) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon).
 * Parameters: (lat, lng) — matches server/utils/geo.ts convention.
 * Point must be inside the outer ring and outside all holes.
 */
function pointInGeometry(lat: number, lng: number, geometry: Geometry): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates;
    if (!pointInRing(lat, lng, outer)) return false;
    for (const hole of holes) {
      if (pointInRing(lat, lng, hole)) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      const [outer, ...holes] = polygon;
      if (pointInRing(lat, lng, outer)) {
        let inHole = false;
        for (const hole of holes) {
          if (pointInRing(lat, lng, hole)) { inHole = true; break; }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

/**
 * Given a lat/lng and the neighborhoods GeoJSON FeatureCollection,
 * return the community name that contains the point, or null if outside all boundaries.
 *
 * NOTE: This is the client-side equivalent of server/utils/geo.ts pointInFeature().
 * Both use ray-casting with the same algorithm and (lat, lng) parameter order.
 */
export function findCommunityAtPoint(
  lat: number,
  lng: number,
  boundaries: FeatureCollection,
): string | null {
  for (const feature of boundaries.features) {
    if (!feature.geometry) continue;
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue;
    if (pointInGeometry(lat, lng, feature.geometry)) {
      const props = feature.properties;
      if (!props) continue;
      const name = props.cpname || props.community || props.name || props.NAME || props.COMMUNITY;
      if (name) return name as string;
    }
  }
  return null;
}
