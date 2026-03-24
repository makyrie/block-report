// Shared point-in-polygon utilities — single source of truth for both server and frontend.
// Both tsconfig.json and tsconfig.server.json include the types/ directory.

import type { Geometry } from 'geojson';

/**
 * Ray-casting point-in-polygon test.
 * Ring coordinates are [lng, lat] pairs (GeoJSON convention).
 */
export function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon).
 * Handles holes correctly.
 */
export function pointInGeometry(lng: number, lat: number, geometry: Geometry): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates as number[][][];
    if (!pointInRing(lng, lat, outer)) return false;
    for (const hole of holes) {
      if (pointInRing(lng, lat, hole)) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates as number[][][][]) {
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
