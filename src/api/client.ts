import type { FeatureCollection } from 'geojson';
import type { BlockMetrics, CommunityAnchor, CommunityReport, CommunityTrends, NeighborhoodProfile, TransitStop } from '../types';

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

/** fetchJSON variant that accepts an AbortSignal for cancellation. */
export function fetchJSONWithSignal<T>(url: string, signal?: AbortSignal): Promise<T> {
  return fetchJSON(url, signal ? { signal } : undefined);
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

export function getNeighborhoodBoundaries(): Promise<FeatureCollection> {
  return fetchJSON(`${BASE}/locations/neighborhoods`);
}

export function getTransitScore(community: string, signal?: AbortSignal): Promise<NeighborhoodProfile['transit']> {
  return fetchJSON(`${BASE}/transit?community=${encodeURIComponent(community)}`, signal ? { signal } : undefined);
}

export function get311(community: string, signal?: AbortSignal): Promise<NeighborhoodProfile['metrics']> {
  return fetchJSON(`${BASE}/311?community=${encodeURIComponent(community)}`, signal ? { signal } : undefined);
}

export function getDemographics(tractOrCommunity: string, signal?: AbortSignal): Promise<NeighborhoodProfile['demographics']> {
  return fetchJSON(`${BASE}/demographics?community=${encodeURIComponent(tractOrCommunity)}`, signal ? { signal } : undefined);
}

export function getAccessGap(community: string, signal?: AbortSignal): Promise<NonNullable<NeighborhoodProfile['accessGap']>> {
  return fetchJSON(`${BASE}/access-gap?community=${encodeURIComponent(community)}`, signal ? { signal } : undefined);
}

export function getAccessGapRanking(limit = 10): Promise<{
  ranking: { community: string; accessGapScore: number; signals: NonNullable<NeighborhoodProfile['accessGap']>['signals'] }[];
}> {
  return fetchJSON(`${BASE}/access-gap/ranking?limit=${limit}`);
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

export function get311Trends(community: string, signal?: AbortSignal): Promise<CommunityTrends> {
  return fetchJSON(`${BASE}/311/trends?community=${encodeURIComponent(community)}`, signal ? { signal } : undefined);
}

export function getBlockReport(
  lat: number,
  lng: number,
  radius = 0.25,
  language = 'en',
): Promise<CommunityReport & { preGenerated?: boolean; anchorName?: string; anchorType?: string }> {
  return fetchJSON(`${BASE}/report?lat=${lat}&lng=${lng}&radius=${radius}&language=${language}`);
}
