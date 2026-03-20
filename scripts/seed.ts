import { prisma } from '../server/services/db.js';
import { parse } from 'csv-parse/sync';

// --- Helpers ---

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  console.log(`  Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const text = await res.text();
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseFloat_(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseInt_(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

// --- Geo helpers ---

type Polygon = number[][][]; // [ring][point][lng, lat]

// Ray-casting point-in-polygon test
function pointInPolygon(lat: number, lng: number, polygon: Polygon): boolean {
  for (const ring of polygon) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][1], yi = ring[i][0]; // GeoJSON is [lng, lat]
      const xj = ring[j][1], yj = ring[j][0];
      if ((yi > lng) !== (yj > lng) && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

interface CommunityFeature {
  name: string;
  polygons: Polygon[];
}

function findCommunity(lat: number, lng: number, communities: CommunityFeature[]): string | null {
  for (const c of communities) {
    for (const poly of c.polygons) {
      if (pointInPolygon(lat, lng, poly)) return c.name;
    }
  }
  return null;
}

// --- Seeders ---

async function seedLibraries() {
  console.log('Seeding libraries...');
  const rows = await fetchCsv('https://seshat.datasd.org/gis_library_locations/libraries_datasd.csv');
  const mapped = rows.map((r) => ({
    objectid: parseInt_(r.objectid)!,
    name: r.name || '',
    address: r.address || null,
    city: r.city || null,
    zip: r.zip || null,
    phone: r.phone || null,
    website: r.website || null,
    lat: parseFloat_(r.lat),
    lng: parseFloat_(r.lng),
  }));
  const result = await prisma.library.createMany({ data: mapped });
  console.log(`  ✓ ${result.count} libraries`);
}

async function seedRecCenters() {
  console.log('Seeding rec centers...');
  const rows = await fetchCsv('https://seshat.datasd.org/gis_recreation_center/rec_centers_datasd.csv');
  const mapped = rows.map((r) => ({
    objectid: parseInt_(r.objectid)!,
    rec_bldg: r.rec_bldg || null,
    park_name: r.park_name || null,
    fac_nm_id: r.fac_nm_id || null,
    address: r.address || null,
    zip: r.zip || null,
    sq_ft: parseFloat_(r.sq_ft),
    year_built: parseInt_(r.year_built),
    serv_dist: r.serv_dist || null,
    cd: parseInt_(r.cd),
    neighborhd: r.neighborhd ? r.neighborhd.toUpperCase().trim() : null,
    lat: parseFloat_(r.lat),
    lng: parseFloat_(r.lng),
  }));
  const result = await prisma.recCenter.createMany({ data: mapped });
  console.log(`  ✓ ${result.count} rec centers`);
}

async function seedTransitStops() {
  console.log('Seeding transit stops...');
  const rows = await fetchCsv('https://seshat.datasd.org/gis_transit_stops/transit_stops_datasd.csv');
  const mapped = rows.map((r) => ({
    objectid: parseInt_(r.objectid)!,
    stop_uid: r.stop_uid || null,
    stop_id: r.stop_id || null,
    stop_code: r.stop_code || null,
    stop_name: r.stop_name || null,
    stop_lat: parseFloat_(r.stop_lat),
    stop_lon: parseFloat_(r.stop_lon),
    stop_agncy: r.stop_agncy || null,
    wheelchair: parseInt_(r.wheelchair),
    intersec: r.intersec || null,
    stop_place: r.stop_place || null,
    parent_sta: r.parent_sta || null,
    lat: parseFloat_(r.lat),
    lng: parseFloat_(r.lng),
  }));
  const result = await prisma.transitStop.createMany({ data: mapped });
  console.log(`  ✓ ${result.count} transit stops`);
}

async function seed311() {
  console.log('Seeding 311 requests (last 12 months)...');

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  const cutoff = cutoffDate.toISOString();
  console.log(`  Cutoff date: ${cutoff}`);

  // Determine which year files to fetch for closed requests
  const currentYear = new Date().getFullYear();
  const cutoffYear = cutoffDate.getFullYear();
  const yearsToFetch: number[] = [];
  for (let y = cutoffYear; y <= currentYear; y++) {
    yearsToFetch.push(y);
  }

  const allRows: ReturnType<typeof mapRequest311>[] = [];

  // Fetch open requests
  const openRows = await fetchCsv(
    'https://seshat.datasd.org/get_it_done_reports/get_it_done_requests_open_datasd.csv'
  );
  for (const r of openRows) {
    const dateRequested = r.date_requested || '';
    if (dateRequested && new Date(dateRequested) >= cutoffDate) {
      allRows.push(mapRequest311(r));
    }
  }
  console.log(`  Open requests (filtered): ${allRows.length}`);

  // Fetch closed requests by year
  for (const year of yearsToFetch) {
    const url = `https://seshat.datasd.org/get_it_done_reports/get_it_done_requests_closed_${year}_datasd.csv`;
    try {
      const rows = await fetchCsv(url);
      let yearCount = 0;
      for (const r of rows) {
        const dateRequested = r.date_requested || '';
        if (dateRequested && new Date(dateRequested) >= cutoffDate) {
          allRows.push(mapRequest311(r));
          yearCount++;
        }
      }
      console.log(`  Closed ${year} (filtered): ${yearCount}`);
    } catch (e) {
      console.log(`  Skipping closed ${year} (not available): ${(e as Error).message}`);
    }
  }

  // Batch insert in chunks (Prisma has limits on query size)
  const batchSize = 1000;
  let inserted = 0;
  for (let i = 0; i < allRows.length; i += batchSize) {
    const batch = allRows.slice(i, i + batchSize);
    const result = await prisma.request311.createMany({ data: batch });
    inserted += result.count;
  }
  console.log(`  ✓ ${inserted} total 311 requests`);
}

function mapRequest311(r: Record<string, string>) {
  return {
    service_request_id: r.service_request_id,
    date_requested: r.date_requested ? new Date(r.date_requested) : null,
    case_age_days: parseInt_(r.case_age_days),
    service_name: r.service_name || null,
    service_name_detail: r.service_name_detail || null,
    date_closed: r.date_closed ? new Date(r.date_closed) : null,
    status: r.status || null,
    lat: parseFloat_(r.lat),
    lng: parseFloat_(r.lng),
    street_address: r.street_address || null,
    zipcode: r.zipcode || null,
    council_district: r.council_district || null,
    comm_plan_code: r.comm_plan_code || null,
    comm_plan_name: r.comm_plan_name ? toTitleCase(r.comm_plan_name.trim()) : null,
    case_origin: r.case_origin || null,
    public_description: r.public_description || null,
  };
}

async function seedCensusLanguage() {
  console.log('Seeding Census language data...');

  const censusKey = process.env.CENSUS_API_KEY;
  if (!censusKey) {
    console.log('  ⚠ CENSUS_API_KEY not set, skipping Census data');
    return;
  }

  const fields = [
    'C16001_001E', 'C16001_002E', 'C16001_003E', 'C16001_006E',
    'C16001_009E', 'C16001_012E', 'C16001_015E', 'C16001_018E',
    'C16001_021E', 'C16001_024E', 'C16001_027E', 'C16001_030E',
  ];

  const url = `https://api.census.gov/data/2021/acs/acs5?get=${fields.join(',')}&for=tract:*&in=state:06&in=county:073&key=${censusKey}`;
  console.log(`  Fetching Census ACS data...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Census API failed: ${res.status}`);
  const data: string[][] = await res.json();

  // First row is headers, rest are data
  const [, ...rows] = data;
  const mapped = rows.map((row) => ({
    tract: row[row.length - 1], // last column is tract
    total_pop_5plus: parseInt_(row[0]),
    english_only: parseInt_(row[1]),
    spanish: parseInt_(row[2]),
    french_haitian_cajun: parseInt_(row[3]),
    german_west_germanic: parseInt_(row[4]),
    russian_polish_slavic: parseInt_(row[5]),
    korean: parseInt_(row[6]),
    chinese: parseInt_(row[7]),
    vietnamese: parseInt_(row[8]),
    tagalog: parseInt_(row[9]),
    arabic: parseInt_(row[10]),
    other_unspecified: parseInt_(row[11]),
  }));

  const result = await prisma.censusLanguage.createMany({ data: mapped });
  console.log(`  ✓ ${result.count} Census tracts`);

  // Map tracts to communities using centroids + community boundaries
  await mapTractsToCommunitites(rows);
}

async function mapTractsToCommunitites(censusRows: string[][]) {
  console.log('Mapping Census tracts to communities...');

  // Fetch community boundaries GeoJSON
  console.log('  Fetching community boundaries...');
  const boundaryRes = await fetch(
    'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson'
  );
  if (!boundaryRes.ok) {
    console.log('  ⚠ Failed to fetch community boundaries, skipping tract mapping');
    return;
  }
  const boundaries = await boundaryRes.json();

  // Parse community features
  const communities: CommunityFeature[] = [];
  for (const feature of boundaries.features) {
    const name = toTitleCase((feature.properties.cpname || feature.properties.name || '').trim());
    if (!name) continue;
    const geom = feature.geometry;
    const polygons: Polygon[] =
      geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    communities.push({ name, polygons });
  }
  console.log(`  ${communities.length} community boundaries loaded`);

  // Fetch tract centroids from TIGERweb
  console.log('  Fetching tract centroids from TIGERweb...');
  const tigerUrl =
    'https://tigerweb.geo.census.gov/arcrest/services/TIGERweb/tigerWMS_ACS2021/MapServer/8/query' +
    "?where=STATE='06'+AND+COUNTY='073'&outFields=TRACT,CENTLAT,CENTLON&f=json&returnGeometry=false";
  const tigerRes = await fetch(tigerUrl);
  if (!tigerRes.ok) {
    console.log('  ⚠ Failed to fetch tract centroids, skipping tract mapping');
    return;
  }
  const tigerData = await tigerRes.json();

  // Build tract → centroid map
  const tractCentroids = new Map<string, { lat: number; lng: number }>();
  for (const feat of tigerData.features || []) {
    const attrs = feat.attributes || feat.properties;
    if (attrs?.TRACT && attrs.CENTLAT != null && attrs.CENTLON != null) {
      tractCentroids.set(attrs.TRACT, { lat: Number(attrs.CENTLAT), lng: Number(attrs.CENTLON) });
    }
  }
  console.log(`  ${tractCentroids.size} tract centroids loaded`);

  // Match each tract to a community
  let mapped = 0;
  for (const row of censusRows) {
    const tract = row[row.length - 1];
    const centroid = tractCentroids.get(tract);
    if (!centroid) continue;

    const community = findCommunity(centroid.lat, centroid.lng, communities);
    if (!community) continue;

    await prisma.censusLanguage.update({
      where: { tract },
      data: { community },
    });
    mapped++;
  }
  console.log(`  ✓ ${mapped} tracts mapped to communities`);
}

async function seedPermits() {
  console.log('Seeding permits (last 12 months)...');
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

  const rows = await fetchCsv(
    'https://seshat.datasd.org/dsd_permits/dsd_permits_all_pts_datasd.csv'
  );

  const filtered = rows.filter((r) => {
    const dateStr = r.date_issued || r.approval_date || '';
    if (!dateStr || new Date(dateStr) < cutoffDate) return false;
    const status = (r.status || '').toLowerCase();
    return !['denied', 'withdrawn', 'cancelled', 'void'].includes(status);
  });

  console.log(`  Filtered to ${filtered.length} recent permits`);

  const mapped = filtered.map((r) => ({
    permit_number: r.permit_number || r.approval_id || r.project_id || '',
    permit_type: r.permit_type || r.approval_type || null,
    description: r.project_title || r.description || null,
    date_issued: (r.date_issued || r.approval_date) ? new Date(r.date_issued || r.approval_date) : null,
    status: r.status || null,
    street_address: r.street_address || r.address || null,
    community: r.comm_plan_name ? toTitleCase(r.comm_plan_name.trim()) : (r.community_plan ? toTitleCase(r.community_plan.trim()) : null),
    lat: parseFloat_(r.lat),
    lng: parseFloat_(r.lng),
  }));

  // Deduplicate by permit_number (CSV may have dupes)
  const seen = new Set<string>();
  const unique = mapped.filter((p) => {
    if (!p.permit_number || seen.has(p.permit_number)) return false;
    seen.add(p.permit_number);
    return true;
  });

  const batchSize = 1000;
  let inserted = 0;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const result = await prisma.permit.createMany({ data: batch });
    inserted += result.count;
  }
  console.log(`  ✓ ${inserted} permits`);
}

// --- Main ---

async function main() {
  console.log('Starting seed...\n');

  console.log('Truncating tables...');
  await prisma.$executeRawUnsafe(
    'TRUNCATE libraries, rec_centers, transit_stops, requests_311, census_language, permits'
  );
  console.log('  ✓ Tables truncated\n');

  await seedLibraries();
  await seedRecCenters();
  await seedTransitStops();
  await seed311();
  await seedCensusLanguage();
  await seedPermits();

  console.log('\nSeed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
