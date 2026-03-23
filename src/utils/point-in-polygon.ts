import type { FeatureCollection, Geometry, Position } from 'geojson';

/**
 * Ray-casting point-in-polygon test.
 * Ring coordinates follow GeoJSON convention: [lng, lat] pairs.
 * Point coordinates: (lng, lat) to match ring ordering.
 */
function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = [ring[i][0], ring[i][1]]; // [lng, lat]
    const [xj, yj] = [ring[j][0], ring[j][1]];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon).
 * Point must be inside the outer ring and outside all holes.
 */
function pointInGeometry(lng: number, lat: number, geometry: Geometry): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates;
    if (!pointInRing(lng, lat, outer)) return false;
    for (const hole of holes) {
      if (pointInRing(lng, lat, hole)) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      const [outer, ...holes] = polygon;
      if (pointInRing(lng, lat, outer)) {
        let inHole = false;
        for (const hole of holes) {
          if (pointInRing(lng, lat, hole)) { inHole = true; break; }
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
 * Both use ray-casting with the same algorithm. The client version works with
 * GeoJSON typed geometries; the server version works with raw number[][].
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
      const props = feature.properties;
      if (!props) continue;
      const name = props.cpname || props.community || props.name || props.NAME || props.COMMUNITY;
      if (name) return name as string;
    }
  }
  return null;
}
