import { prisma } from './db.js';
import { normalizeCommunityName, getNeighborhoodsGeoJSON } from './communities.js';
import { pointInFeature } from './geo.js';

export async function getLibraries() {
  return prisma.library.findMany();
}

export async function getLibraryCountByCommunity(communityName: string): Promise<number> {
  const key = normalizeCommunityName(communityName);
  const geojson = await getNeighborhoodsGeoJSON();
  const feature = geojson.features.find((f) => {
    const name: string = f.properties?.cpname || f.properties?.name || '';
    return name.toUpperCase() === key;
  });
  if (!feature) return 0;

  const libraries = await prisma.library.findMany({
    select: { lat: true, lng: true },
  });

  return libraries.filter((lib) =>
    lib.lat != null && lib.lng != null && pointInFeature(lib.lat, lib.lng, feature.geometry),
  ).length;
}

export async function getRecCenters(communityName?: string) {
  if (!communityName) {
    return prisma.recCenter.findMany();
  }

  // RecCenter neighborhd field is ALL CAPS
  const key = normalizeCommunityName(communityName);
  return prisma.recCenter.findMany({
    where: { neighborhd: key },
  });
}

export async function getTransitStops() {
  return prisma.transitStop.findMany({
    select: { objectid: true, stop_name: true, lat: true, lng: true },
  });
}
