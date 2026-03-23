// Server geo utilities — delegates core point-in-polygon to shared types/geo.ts
// and adds server-specific helpers (bbox, haversine, centroid).

import type { Polygon, MultiPolygon } from 'geojson';
import { pointInRing, pointInGeometry } from '../../types/geo.js';

type PolygonLike = Polygon | MultiPolygon;

// Re-export the shared algorithm under the legacy name used by scripts/geo-helpers.ts
export function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  return pointInRing(lng, lat, polygon);
}

// Re-export for direct use
export { pointInGeometry };

// Test whether a point is inside a GeoJSON Feature geometry (Polygon or MultiPolygon)
export function pointInFeature(
  lat: number,
  lng: number,
  geometry: PolygonLike,
): boolean {
  return pointInGeometry(lng, lat, geometry);
}

// Compute bounding box for a polygon ring (used for spatial pre-filtering)
export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function computeBBox(geometry: PolygonLike): BBox {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  function processRing(ring: number[][]) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }

  if (geometry.type === 'Polygon') {
    processRing((geometry.coordinates as number[][][])[0]);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates as number[][][][]) {
      processRing(poly[0]);
    }
  }

  return { minLat, maxLat, minLng, maxLng };
}

export function pointInBBox(lat: number, lng: number, bbox: BBox): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
}

// Haversine distance in miles between two lat/lng points
export function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compute the centroid of a GeoJSON Polygon or MultiPolygon geometry
export function computeCentroid(geometry: PolygonLike): { lat: number; lng: number } | null {
  let ring: number[][] = [];
  if (geometry.type === 'Polygon') {
    ring = (geometry.coordinates as number[][][])[0];
  } else if (geometry.type === 'MultiPolygon') {
    let maxLen = 0;
    for (const poly of geometry.coordinates as number[][][][]) {
      if (poly[0].length > maxLen) {
        maxLen = poly[0].length;
        ring = poly[0];
      }
    }
  }
  if (ring.length === 0) return null;
  let latSum = 0;
  let lngSum = 0;
  for (const [lng, lat] of ring) {
    latSum += lat;
    lngSum += lng;
  }
  return { lat: latSum / ring.length, lng: lngSum / ring.length };
}
