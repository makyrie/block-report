/**
 * Static mapping of San Diego zip codes to community plan area names.
 * Names match the COMMUNITIES list in neighborhood-selector.tsx.
 * A zip may span multiple communities — the user picks when that happens.
 */
export const ZIP_TO_NEIGHBORHOODS: Record<string, string[]> = {
  '92037': ['La Jolla'],
  '92101': ['Balboa Park', 'East Village', 'Gaslamp Quarter', 'Little Italy'],
  '92103': ['Balboa Park', 'Hillcrest', 'Mission Hills'],
  '92104': ['North Park'],
  '92105': ['City Heights', 'Chollas View'],
  '92106': ['Point Loma'],
  '92107': ['Ocean Beach', 'Point Loma'],
  '92108': ['Mission Valley'],
  '92109': ['Mission Bay', 'Pacific Beach'],
  '92110': ['Bay Park', 'Midway', 'Mission Hills', 'Old Town'],
  '92111': ['Clairemont Mesa', 'Kearny Mesa', 'Linda Vista'],
  '92113': ['Barrio Logan', 'Logan Heights'],
  '92114': ['Chollas View', 'Encanto', 'Skyline', 'Valencia Park'],
  '92115': ['College Area'],
  '92116': ['Normal Heights', 'North Park'],
  '92117': ['Bay Ho', 'Clairemont Mesa'],
  '92119': ['Navajo'],
  '92120': ['Del Cerro', 'Navajo'],
  '92121': ['University City'],
  '92122': ['University City'],
  '92123': ['Kearny Mesa', 'Serra Mesa'],
  '92124': ['Tierrasanta'],
  '92126': ['Mira Mesa'],
  '92127': ['Rancho Bernardo', 'Rancho Penasquitos'],
  '92128': ['Carmel Mountain Ranch', 'Rancho Bernardo'],
  '92129': ['Rancho Penasquitos'],
  '92130': ['Rancho Penasquitos'],
  '92131': ['Scripps Ranch'],
  '92139': ['Skyline', 'Southeastern'],
  '92154': ['Otay Mesa'],
  '92173': ['Otay Mesa', 'San Ysidro'],
};

export function lookupZip(zip: string): string[] | null {
  const trimmed = zip.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;
  return ZIP_TO_NEIGHBORHOODS[trimmed] ?? [];
}
