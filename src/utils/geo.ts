// Core geo primitives — single source of truth for point-in-polygon logic.
// Shared by both frontend (src/) and backend (server/) code.

import type { Polygon, MultiPolygon } from 'geojson';

export type PolygonLike = Polygon | MultiPolygon;

/**
 * Ray-casting point-in-polygon test.
 * Coordinates: lat/lng for the point, polygon ring as [lng, lat] pairs (GeoJSON convention).
 */
export function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Test whether a point is inside a GeoJSON Feature geometry (Polygon or MultiPolygon).
 * Correctly excludes points that fall inside polygon holes.
 */
export function pointInFeature(
  lat: number,
  lng: number,
  geometry: PolygonLike,
): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates as number[][][];
    if (!pointInPolygon(lat, lng, outer)) return false;
    for (const hole of holes) {
      if (pointInPolygon(lat, lng, hole)) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates as number[][][][]) {
      const [outer, ...holes] = poly;
      if (pointInPolygon(lat, lng, outer)) {
        let inHole = false;
        for (const hole of holes) {
          if (pointInPolygon(lat, lng, hole)) { inHole = true; break; }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}
