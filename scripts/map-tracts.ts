import { prisma } from '../server/services/db.js';
import { findCommunity, parseCommunityFeatures } from './geo-helpers.js';

async function main() {
  console.log('Fetching community boundaries...');
  const boundaryRes = await fetch(
    'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson'
  );
  if (!boundaryRes.ok) throw new Error(`Failed to fetch boundaries: ${boundaryRes.status}`);
  const boundaries = await boundaryRes.json();

  const communities = parseCommunityFeatures(boundaries);
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
