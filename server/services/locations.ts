import { prisma } from './db.js';

export async function getLibraries(communityName?: string) {
  if (!communityName) {
    return prisma.library.findMany();
  }

  // Libraries don't have a community field, so we return all for now
  // A spatial filter could be added later using point-in-polygon
  return prisma.library.findMany();
}

export async function getRecCenters(communityName?: string) {
  if (!communityName) {
    return prisma.recCenter.findMany();
  }

  // RecCenter neighborhd field is ALL CAPS
  const key = communityName.toUpperCase().trim();
  return prisma.recCenter.findMany({
    where: { neighborhd: key },
  });
}

export async function getTransitStops() {
  return prisma.transitStop.findMany({
    select: { objectid: true, stop_name: true, lat: true, lng: true },
  });
}
