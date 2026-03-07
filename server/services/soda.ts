// SODA API client for San Diego open data
// Data workstream owns this file

import { getCached, setCache } from '../cache.js';
import type { CommunityAnchor } from '../../src/types/index.js';

// --- GeoJSON type helpers ---

interface GeoJsonFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry?: {
    type: string;
    coordinates: number[];
  };
}

interface GeoJsonCollection {
  type: string;
  features: GeoJsonFeature[];
}

interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface RawRow {
  [key: string]: string;
}

// --- CSV parser (no external dependency) ---

function parseCSV(text: string): RawRow[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: RawRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim()] = (values[j] || '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// --- Fetch helpers ---

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

// --- Public API ---

export async function fetchLibraries(): Promise<CommunityAnchor[]> {
  const cacheKey = 'soda:libraries';
  const cached = await getCached<CommunityAnchor[]>(cacheKey);
  if (cached) return cached;

  const url = 'https://seshat.datasd.org/gis_library_locations/libraries_datasd.geojson';
  const geojson = await fetchJson<GeoJsonCollection>(url);

  const libraries: CommunityAnchor[] = geojson.features.map((feature, idx) => {
    const p = feature.properties;
    const lat = Number(p.lat) || feature.geometry?.coordinates[1] || 0;
    const lng = Number(p.lng) || feature.geometry?.coordinates[0] || 0;

    return {
      id: String(p.objectid || idx),
      name: String(p.name || ''),
      type: 'library' as const,
      lat,
      lng,
      address: String(p.address || ''),
      phone: p.phone ? String(p.phone) : undefined,
      website: p.website ? String(p.website) : undefined,
      community: '',
    };
  });

  await setCache(cacheKey, libraries);
  return libraries;
}

export async function fetchRecCenters(): Promise<CommunityAnchor[]> {
  const cacheKey = 'soda:rec-centers';
  const cached = await getCached<CommunityAnchor[]>(cacheKey);
  if (cached) return cached;

  const url = 'https://seshat.datasd.org/gis_recreation_center/rec_centers_datasd.geojson';
  const geojson = await fetchJson<GeoJsonCollection>(url);

  const centers: CommunityAnchor[] = geojson.features.map((feature, idx) => {
    const p = feature.properties;
    const lat = Number(p.lat) || feature.geometry?.coordinates[1] || 0;
    const lng = Number(p.lng) || feature.geometry?.coordinates[0] || 0;
    const name = String(p.rec_bldg || p.park_name || '');
    const neighborhood = String(p.neighborhd || '');

    return {
      id: String(p.objectid || idx),
      name,
      type: 'rec_center' as const,
      lat,
      lng,
      address: String(p.address || ''),
      community: neighborhood,
    };
  });

  await setCache(cacheKey, centers);
  return centers;
}

export async function fetchTransitStops(): Promise<TransitStop[]> {
  const cacheKey = 'soda:transit-stops';
  const cached = await getCached<TransitStop[]>(cacheKey);
  if (cached) return cached;

  const url = 'https://seshat.datasd.org/gis_transit_stops/transit_stops_datasd.geojson';
  const geojson = await fetchJson<GeoJsonCollection>(url);

  const stops: TransitStop[] = geojson.features.map((feature, idx) => {
    const p = feature.properties;
    const lat = Number(p.lat) || Number(p.stop_lat) || feature.geometry?.coordinates[1] || 0;
    const lng = Number(p.lng) || Number(p.stop_lon) || feature.geometry?.coordinates[0] || 0;

    return {
      id: String(p.stop_uid || p.stop_id || idx),
      name: String(p.stop_name || ''),
      lat,
      lng,
    };
  });

  await setCache(cacheKey, stops);
  return stops;
}

export async function fetch311(community: string): Promise<RawRow[]> {
  const cacheKey = 'soda:311-open';
  let allRows = await getCached<RawRow[]>(cacheKey);

  if (!allRows) {
    const url = 'https://seshat.datasd.org/get_it_done_reports/get_it_done_requests_open_datasd.csv';
    const text = await fetchText(url);
    allRows = parseCSV(text);
    await setCache(cacheKey, allRows);
  }

  const normalizedCommunity = community.toLowerCase();
  return allRows.filter(
    (row) => (row.comm_plan_name || '').toLowerCase() === normalizedCommunity
  );
}
