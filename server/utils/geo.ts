// Server geo utilities — point-in-polygon, bbox, haversine, centroid.

import type { Polygon, MultiPolygon } from 'geojson';

type PolygonLike = Polygon | MultiPolygon;

// Ray-casting point-in-polygon test.
// Point: (lat, lng). Polygon ring: GeoJSON [lng, lat] pairs.
// Internally maps to (x=lng, y=lat) for the ray-cast comparison.
export function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [pLng_i, pLat_i] = polygon[i]; // GeoJSON: [lng, lat]
    const [pLng_j, pLat_j] = polygon[j];
    if ((pLat_i > lat) !== (pLat_j > lat) && lng < ((pLng_j - pLng_i) * (lat - pLat_i)) / (pLat_j - pLat_i) + pLng_i) {
      inside = !inside;
    }
  }
  return inside;
}

// Test whether a point is inside a GeoJSON Feature geometry (Polygon or MultiPolygon)
// Correctly handles polygon holes: point must be inside outer ring AND outside all holes
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
    return false;
  }
  return false;
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
