import type { FeatureCollection } from 'geojson';
import type { BlockMetrics, CitywideCommunity, CommunityAnchor, CommunityReport, NeighborhoodProfile, TransitStop } from '../types';

const BASE = '/api';

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch { /* use default message */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function getLibraries(): Promise<CommunityAnchor[]> {
  return fetchJSON(`${BASE}/locations/libraries`);
}

export function getRecCenters(): Promise<CommunityAnchor[]> {
  return fetchJSON(`${BASE}/locations/rec-centers`);
}

export function getTransitStops(): Promise<TransitStop[]> {
  return fetchJSON(`${BASE}/locations/transit-stops`);
}

let boundaryPromise: Promise<FeatureCollection> | null = null;
let boundaryCachedAt = 0;
const BOUNDARY_CLIENT_TTL = 60 * 60 * 1000; // 1 hour

export function getNeighborhoodBoundaries(): Promise<FeatureCollection> {
  if (boundaryPromise && Date.now() - boundaryCachedAt < BOUNDARY_CLIENT_TTL) {
    return boundaryPromise;
  }
  boundaryCachedAt = Date.now();
  boundaryPromise = fetchJSON<FeatureCollection>(
    `${BASE}/locations/neighborhoods`,
  ).catch((err) => {
    boundaryPromise = null; // Allow retry on failure
    throw err;
  });
  return boundaryPromise;
}

export function getTransitScore(community: string): Promise<NeighborhoodProfile['transit']> {
  return fetchJSON(`${BASE}/transit?community=${encodeURIComponent(community)}`);
}

export function get311(community: string): Promise<NeighborhoodProfile['metrics']> {
  return fetchJSON(`${BASE}/311?community=${encodeURIComponent(community)}`);
}

export function getDemographics(tractOrCommunity: string): Promise<NeighborhoodProfile['demographics']> {
  return fetchJSON(`${BASE}/demographics?community=${encodeURIComponent(tractOrCommunity)}`);
}

export function getAccessGap(community: string): Promise<NonNullable<NeighborhoodProfile['accessGap']>> {
  return fetchJSON(`${BASE}/access-gap?community=${encodeURIComponent(community)}`);
}

export function getCitywideGaps(signal?: AbortSignal): Promise<{
  ranking: CitywideCommunity[];
  summary: { total: number; withGaps: number };
}> {
  return fetchJSON(`${BASE}/access-gap/ranking?limit=0`, signal ? { signal } : undefined);
}

export function getBlockData(lat: number, lng: number, radius = 0.25): Promise<BlockMetrics> {
  return fetchJSON(`${BASE}/block?lat=${lat}&lng=${lng}&radius=${radius}`);
}

export async function getPreGeneratedReport(community: string, language: string): Promise<CommunityReport | null> {
  try {
    return await fetchJSON(`${BASE}/report?community=${encodeURIComponent(community)}&language=${encodeURIComponent(language)}`);
  } catch {
    return null; // 404 or error — no pre-generated report available
  }
}

export function generateReport(profile: NeighborhoodProfile, language: string): Promise<CommunityReport> {
  return fetchJSON(`${BASE}/report/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, language }),
  });
}

export async function downloadPdf(
  report: CommunityReport,
  neighborhoodSlug: string,
  metrics?: NeighborhoodProfile['metrics'] | null,
  topLanguages?: { language: string; percentage: number }[],
): Promise<Blob> {
  const res = await fetch(`${BASE}/report/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report, neighborhoodSlug, metrics, topLanguages }),
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch { /* use default message */ }
    throw new Error(message);
  }
  return res.blob();
}

export function getBlockReport(
  lat: number,
  lng: number,
  radius = 0.25,
  language = 'en',
): Promise<CommunityReport & { preGenerated?: boolean; anchorName?: string; anchorType?: string }> {
  return fetchJSON(`${BASE}/report?lat=${lat}&lng=${lng}&radius=${radius}&language=${language}`);
}
