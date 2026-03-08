import { prisma } from '../server/services/db.js';

type Polygon = number[][][];
interface CommunityFeature {
  name: string;
  polygons: Polygon[];
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function pointInPolygon(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function findCommunity(lat: number, lng: number, communities: CommunityFeature[]): string | null {
  for (const c of communities) {
    for (const poly of c.polygons) {
      if (pointInPolygon(lat, lng, poly[0])) return c.name;
    }
  }
  return null;
}

async function main() {
  console.log('Fetching community boundaries...');
  const boundaryRes = await fetch(
    'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson'
  );
  if (!boundaryRes.ok) throw new Error(`Failed to fetch boundaries: ${boundaryRes.status}`);
  const boundaries = await boundaryRes.json();

  const communities: CommunityFeature[] = [];
  for (const feature of boundaries.features) {
    const name = toTitleCase((feature.properties.cpname || feature.properties.name || '').trim());
    if (!name) continue;
    const geom = feature.geometry;
    const polygons: Polygon[] = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    communities.push({ name, polygons });
  }
  console.log(`  ${communities.length} community boundaries loaded`);

  // Fetch Census gazetteer for CA tracts (has INTPTLAT/INTPTLONG centroids)
  console.log('Fetching Census gazetteer for tract centroids...');
  const gazRes = await fetch(
    'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_gaz_tracts_06.txt'
  );
  if (!gazRes.ok) throw new Error(`Failed to fetch gazetteer: ${gazRes.status}`);
  const gazText = await gazRes.text();
  const lines = gazText.trim().split('\n');
  const header = lines[0].split('\t');

  // Find column indices
  const geoidIdx = header.findIndex((h) => h.trim() === 'GEOID');
  const latIdx = header.findIndex((h) => h.trim() === 'INTPTLAT');
  const lngIdx = header.findIndex((h) => h.trim() === 'INTPTLONG');

  // Build tract -> centroid map (San Diego County = FIPS 06073)
  const tractCentroids = new Map<string, { lat: number; lng: number }>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const geoid = cols[geoidIdx]?.trim();
    if (!geoid || !geoid.startsWith('06073')) continue;
    const tract = geoid.slice(5); // remove state+county prefix
    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (!isNaN(lat) && !isNaN(lng)) {
      tractCentroids.set(tract, { lat, lng });
    }
  }
  console.log(`  ${tractCentroids.size} San Diego tract centroids loaded`);

  // Get all tracts from DB
  const dbTracts = await prisma.censusLanguage.findMany({
    select: { tract: true },
  });

  let mapped = 0;
  for (const row of dbTracts) {
    const centroid = tractCentroids.get(row.tract);
    if (!centroid) continue;

    const community = findCommunity(centroid.lat, centroid.lng, communities);
    if (!community) continue;

    await prisma.censusLanguage.update({
      where: { tract: row.tract },
      data: { community },
    });
    mapped++;
  }
  console.log(`\n  Mapped ${mapped} of ${dbTracts.length} tracts to communities`);
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
