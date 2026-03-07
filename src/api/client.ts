import type { FeatureCollection } from 'geojson';
import type { CommunityAnchor, CommunityBrief, NeighborhoodProfile, TransitStop } from '../types';

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

export function getNeighborhoodBoundaries(): Promise<FeatureCollection> {
  return fetchJSON(`${BASE}/locations/neighborhoods`);
}

export function get311(community: string): Promise<NeighborhoodProfile['metrics']> {
  return fetchJSON(`${BASE}/311?community=${encodeURIComponent(community)}`);
}

export function getDemographics(tractOrCommunity: string): Promise<NeighborhoodProfile['demographics']> {
  return fetchJSON(`${BASE}/demographics?community=${encodeURIComponent(tractOrCommunity)}`);
}

export function generateBrief(profile: NeighborhoodProfile, language: string): Promise<CommunityBrief> {
  return fetchJSON(`${BASE}/brief/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, language }),
  });
}
