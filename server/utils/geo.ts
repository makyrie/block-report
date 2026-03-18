// Shared geographic utility functions

// San Diego bounding box
export const SD_BOUNDS = { latMin: 32.5, latMax: 33.2, lngMin: -117.6, lngMax: -116.8 } as const;

// 1 degree of latitude ~ 69 miles; longitude varies by latitude
export const MILES_PER_LAT_DEG = 69;
// At San Diego (~32.7°N): 1 deg longitude ~ 58.8 miles
export const MILES_PER_LNG_DEG = 58.8;

export function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
