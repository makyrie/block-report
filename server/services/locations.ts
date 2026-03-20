import { prisma } from './db.js';
import { normalizeCommunityName } from './communities.js';

export async function getLibraries() {
  return prisma.library.findMany();
}

export async function getLibraryCount(): Promise<number> {
  return prisma.library.count();
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
