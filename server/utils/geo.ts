// Shared geo utilities — single source of truth for point-in-polygon logic

// Ray-casting point-in-polygon test
// Coordinates: lat/lng for the point, polygon ring as [lng, lat] pairs (GeoJSON convention)
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

// Test whether a point is inside a GeoJSON Feature geometry (Polygon or MultiPolygon)
export function pointInFeature(
  lat: number,
  lng: number,
  geometry: { type: string; coordinates: number[][][] | number[][][][] },
): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lat, lng, (geometry.coordinates as number[][][])[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some((poly) =>
      pointInPolygon(lat, lng, poly[0]),
    );
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

export function computeBBox(geometry: { type: string; coordinates: number[][][] | number[][][][] }): BBox {
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
