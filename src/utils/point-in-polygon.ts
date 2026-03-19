import type { FeatureCollection, Geometry, Position } from 'geojson';

/**
 * Ray-casting point-in-polygon test.
 * Returns true if the point (x, y) lies inside the polygon ring.
 */
function pointInRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon).
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
