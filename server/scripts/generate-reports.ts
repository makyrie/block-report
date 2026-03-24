/**
 * Nightly batch generation of reports for all neighborhoods × top languages.
 *
 * Requires the Express server to be running on localhost:3001 (or PORT env var).
 * Usage: npx tsx server/scripts/generate-reports.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { NeighborhoodProfile, CommunityReport, BlockMetrics, CommunityAnchor, StoredBlockReport } from '../../src/types/index.js';
import { LANGUAGE_CODES } from '../../src/constants/languages.js';
import { sanitizeFilename as sharedSanitizeFilename } from '../utils/language.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'cache', 'reports');
const BLOCK_REPORTS_DIR = path.join(REPORTS_DIR, 'blocks');
const MANIFEST_PATH = path.join(REPORTS_DIR, 'manifest.json');

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;
const DELAY_MS = 1000; // 1 second between Claude API calls
const LANGUAGE_THRESHOLD = 5; // minimum % to include a language

interface StoredReport {
  communityName: string;
  language: string;
  languageCode: string;
  generatedAt: string;
  dataAsOf: string;
  report: CommunityReport;
}

interface ManifestEntry {
  communityName: string;
  language: string;
  languageCode: string;
  generatedAt: string;
  dataAsOf: string;
  filename: string;
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} from ${url}`);
  }
  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const sanitizeFilename = sharedSanitizeFilename;

async function getAllCommunities(): Promise<string[]> {
  const geojson = await fetchJSON<{
    features: { properties: { cpname?: string; name?: string } }[];
  }>(`${BASE_URL}/api/locations/neighborhoods`);

  const names = geojson.features
    .map((f) => f.properties?.cpname || f.properties?.name || '')
    .filter((n) => n.length > 0);

  return [...new Set(names)].sort();
}

async function assembleProfile(community: string): Promise<NeighborhoodProfile | null> {
  const encoded = encodeURIComponent(community);

  try {
    const [metrics, transit, demographics, libraries, recCenters] = await Promise.all([
      fetchJSON<NeighborhoodProfile['metrics']>(`${BASE_URL}/api/311?community=${encoded}`),
      fetchJSON<NeighborhoodProfile['transit']>(`${BASE_URL}/api/transit?community=${encoded}`),
      fetchJSON<NeighborhoodProfile['demographics']>(`${BASE_URL}/api/demographics?community=${encoded}`),
      fetchJSON<{ name: string; address: string; lat: number; lng: number; community: string }[]>(
        `${BASE_URL}/api/locations/libraries`,
      ),
      fetchJSON<{ rec_bldg: string; park_name: string; address: string; lat: number; lng: number; neighborhd: string }[]>(
        `${BASE_URL}/api/locations/rec-centers`,
      ),
    ]);

    // Find nearest anchor (library or rec center in this community)
    const communityUpper = community.toUpperCase();
    const nearbyLib = libraries.find(
      (l) => l.community?.toUpperCase() === communityUpper,
    );
    const nearbyRec = recCenters.find(
      (r) => r.neighborhd?.toUpperCase() === communityUpper,
    );

    const anchor = nearbyLib
      ? {
          id: `lib-${nearbyLib.name}`,
          name: nearbyLib.name,
          type: 'library' as const,
          lat: nearbyLib.lat,
          lng: nearbyLib.lng,
          address: nearbyLib.address,
          community,
        }
      : nearbyRec
        ? {
            id: `rec-${nearbyRec.rec_bldg || nearbyRec.park_name}`,
            name: nearbyRec.rec_bldg || nearbyRec.park_name,
            type: 'rec_center' as const,
            lat: nearbyRec.lat,
            lng: nearbyRec.lng,
            address: nearbyRec.address,
            community,
          }
        : {
            id: `community-${community}`,
            name: community,
            type: 'library' as const,
            lat: 0,
            lng: 0,
            address: '',
            community,
          };

    return {
      communityName: community,
      anchor,
      metrics,
      transit: {
        ...transit,
        travelTimeToCityHall: (transit as Record<string, unknown>).travelTimeToCityHall as number | null ?? null,
      },
      demographics,
    };
  } catch (err) {
    console.error(`  Failed to assemble profile for ${community}: ${(err as Error).message}`);
    return null;
  }
}

function getTargetLanguages(profile: NeighborhoodProfile): string[] {
  const languages: string[] = ['English']; // Always generate English

  if (profile.demographics?.topLanguages) {
    for (const lang of profile.demographics.topLanguages) {
      if (
        lang.language !== 'English' &&
        lang.percentage >= LANGUAGE_THRESHOLD &&
        LANGUAGE_CODES[lang.language]
      ) {
        languages.push(lang.language);
      }
    }
  }

  return languages;
}

async function generateReport(
  profile: NeighborhoodProfile,
  language: string,
): Promise<CommunityReport> {
  return fetchJSON<CommunityReport>(`${BASE_URL}/api/report/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, language }),
  });
}

interface AnchorLocation {
  id: string;
  name: string;
  type: 'library' | 'rec_center';
  lat: number;
  lng: number;
  address: string;
  community: string;
}

const BLOCK_RADIUS = 0.25; // miles

async function getAllAnchors(): Promise<AnchorLocation[]> {
  const [libraries, recCenters] = await Promise.all([
    fetchJSON<{ name: string; address: string; lat: number; lng: number; community?: string; objectid?: number }[]>(
      `${BASE_URL}/api/locations/libraries`,
    ),
    fetchJSON<{ rec_bldg: string; park_name: string; address: string; lat: number; lng: number; neighborhd?: string; objectid?: number }[]>(
      `${BASE_URL}/api/locations/rec-centers`,
    ),
  ]);

  const anchors: AnchorLocation[] = [];

  for (const lib of libraries) {
    if (!lib.lat || !lib.lng) continue;
    anchors.push({
      id: `library_${lib.objectid || sanitizeFilename(lib.name)}`,
      name: lib.name,
      type: 'library',
      lat: lib.lat,
      lng: lib.lng,
      address: lib.address || '',
      community: lib.community || '',
    });
  }

  for (const rec of recCenters) {
    if (!rec.lat || !rec.lng) continue;
    anchors.push({
      id: `rec_${rec.objectid || sanitizeFilename(rec.rec_bldg || rec.park_name)}`,
      name: rec.rec_bldg || rec.park_name,
      type: 'rec_center',
      lat: rec.lat,
      lng: rec.lng,
      address: rec.address || '',
      community: rec.neighborhd || '',
    });
  }

  return anchors;
}

async function getBlockMetrics(lat: number, lng: number, radius: number): Promise<BlockMetrics> {
  return fetchJSON<BlockMetrics>(`${BASE_URL}/api/block?lat=${lat}&lng=${lng}&radius=${radius}`);
}

async function getDemographicsForCommunity(community: string): Promise<{ topLanguages: { language: string; percentage: number }[] } | null> {
  if (!community) return null;
  try {
    return await fetchJSON<{ topLanguages: { language: string; percentage: number }[] }>(
      `${BASE_URL}/api/demographics?community=${encodeURIComponent(community)}`,
    );
  } catch {
    return null;
  }
}

function getTopLanguagesForAnchor(
  demographics: { topLanguages: { language: string; percentage: number }[] } | null,
): string[] {
  const languages: string[] = ['English'];

  if (demographics?.topLanguages) {
    for (const lang of demographics.topLanguages) {
      if (
        lang.language !== 'English' &&
        lang.percentage >= LANGUAGE_THRESHOLD &&
        LANGUAGE_CODES[lang.language]
      ) {
        languages.push(lang.language);
      }
    }
  }

  // Cap at top 2 languages to keep generation manageable
  return languages.slice(0, 2);
}

async function generateBlockReport(
  anchor: AnchorLocation,
  blockMetrics: BlockMetrics,
  language: string,
  demographics?: { topLanguages: { language: string; percentage: number }[] },
): Promise<CommunityReport> {
  // Use the dedicated block report generation endpoint
  const anchorPayload: CommunityAnchor = {
    id: anchor.id,
    name: anchor.name,
    type: anchor.type,
    lat: anchor.lat,
    lng: anchor.lng,
    address: anchor.address,
    community: anchor.community,
  };

  return fetchJSON<CommunityReport>(`${BASE_URL}/api/report/generate-block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anchor: anchorPayload, blockMetrics, language, demographics }),
  });
}

async function main() {
  console.log('=== Block Report Batch Generation ===\n');

  // Ensure output directories exist
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.mkdir(BLOCK_REPORTS_DIR, { recursive: true });

  // 1. Get all communities
  console.log('Fetching community list...');
  const communities = await getAllCommunities();
  console.log(`Found ${communities.length} communities.\n`);

  const dataAsOf = new Date().toISOString();
  const manifest: ManifestEntry[] = [];
  let totalGenerated = 0;
  let totalFailed = 0;
  let reportIndex = 0;

  // ==============================
  // PASS 1: Neighborhood-level reports
  // ==============================
  console.log('--- Pass 1: Neighborhood Reports ---\n');
  console.log('Assembling neighborhood profiles...');
  const generationQueue: { community: string; profile: NeighborhoodProfile; languages: string[] }[] = [];

  for (const community of communities) {
    const profile = await assembleProfile(community);
    if (!profile) {
      console.log(`  Skipping ${community} (profile assembly failed)`);
      continue;
    }
    const languages = getTargetLanguages(profile);
    generationQueue.push({ community, profile, languages });
  }

  const totalNeighborhoodReports = generationQueue.reduce((sum, q) => sum + q.languages.length, 0);
  console.log(`\nNeighborhood matrix: ${generationQueue.length} communities x languages = ${totalNeighborhoodReports} reports\n`);

  // Generate neighborhood reports
  for (const { community, profile, languages } of generationQueue) {
    for (const language of languages) {
      reportIndex++;
      const langCode = LANGUAGE_CODES[language] || 'en';
      const filename = `${sanitizeFilename(community)}_${langCode}.json`;

      console.log(`Generating neighborhood report ${reportIndex}/${totalNeighborhoodReports}: ${community} (${language})...`);

      try {
        const report = await generateReport(profile, language);

        const stored: StoredReport = {
          communityName: community,
          language,
          languageCode: langCode,
          generatedAt: new Date().toISOString(),
          dataAsOf,
          report,
        };

        await fs.writeFile(
          path.join(REPORTS_DIR, filename),
          JSON.stringify(stored, null, 2),
        );

        manifest.push({
          communityName: community,
          language,
          languageCode: langCode,
          generatedAt: stored.generatedAt,
          dataAsOf,
          filename,
        });

        totalGenerated++;
        console.log(`  Done.`);
      } catch (err) {
        console.error(`  FAILED: ${(err as Error).message}`);
        totalFailed++;
      }

      await sleep(DELAY_MS);
    }
  }

  // ==============================
  // PASS 2: Block-level anchor reports
  // ==============================
  console.log('\n--- Pass 2: Block-Level Anchor Reports ---\n');

  console.log('Fetching library and rec center locations...');
  const anchors = await getAllAnchors();
  console.log(`Found ${anchors.length} anchor locations.\n`);

  // Build block report generation queue
  console.log('Assembling block report queue...');
  const blockQueue: { anchor: AnchorLocation; languages: string[]; demographics: { topLanguages: { language: string; percentage: number }[] } | null }[] = [];

  for (const anchor of anchors) {
    const demographics = await getDemographicsForCommunity(anchor.community);
    const languages = getTopLanguagesForAnchor(demographics);
    blockQueue.push({ anchor, languages, demographics });
  }

  const totalBlockReports = blockQueue.reduce((sum, q) => sum + q.languages.length, 0);
  console.log(`Block report matrix: ${anchors.length} anchors x languages = ${totalBlockReports} reports\n`);

  let blockIndex = 0;
  let blockGenerated = 0;
  let blockFailed = 0;

  for (const { anchor, languages, demographics } of blockQueue) {
    // Fetch block metrics once per anchor (same for all languages)
    let blockMetrics: BlockMetrics;
    try {
      blockMetrics = await getBlockMetrics(anchor.lat, anchor.lng, BLOCK_RADIUS);
    } catch (err) {
      console.error(`  Skipping ${anchor.name}: failed to fetch block metrics — ${(err as Error).message}`);
      blockFailed += languages.length;
      blockIndex += languages.length;
      continue;
    }

    for (const language of languages) {
      blockIndex++;
      const langCode = LANGUAGE_CODES[language] || 'en';
      const filename = `${sanitizeFilename(anchor.id)}_${langCode}.json`;

      console.log(`Generating block report ${blockIndex}/${totalBlockReports}: ${anchor.name} (${language})...`);

      try {
        const report = await generateBlockReport(anchor, blockMetrics, language, demographics ?? undefined);

        const stored: StoredBlockReport = {
          anchorName: anchor.name,
          anchorType: anchor.type,
          lat: anchor.lat,
          lng: anchor.lng,
          radiusMiles: BLOCK_RADIUS,
          communityName: anchor.community,
          language: langCode,
          generatedAt: new Date().toISOString(),
          report,
        };

        await fs.writeFile(
          path.join(BLOCK_REPORTS_DIR, filename),
          JSON.stringify(stored, null, 2),
        );

        manifest.push({
          communityName: `${anchor.name} (${anchor.type})`,
          language,
          languageCode: langCode,
          generatedAt: stored.generatedAt,
          dataAsOf,
          filename: `blocks/${filename}`,
        });

        blockGenerated++;
        totalGenerated++;
        console.log(`  Done.`);
      } catch (err) {
        console.error(`  FAILED: ${(err as Error).message}`);
        blockFailed++;
        totalFailed++;
      }

      if (blockIndex < totalBlockReports) {
        await sleep(DELAY_MS);
      }
    }
  }

  // 4. Write manifest
  const manifestData = {
    generatedAt: new Date().toISOString(),
    dataAsOf,
    totalReports: totalGenerated,
    totalFailed,
    neighborhoodReports: totalNeighborhoodReports - (totalFailed - blockFailed),
    blockReports: blockGenerated,
    blockReportsFailed: blockFailed,
    entries: manifest,
  };

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifestData, null, 2));

  console.log(`\n=== Batch Generation Complete ===`);
  console.log(`Neighborhood reports: ${totalNeighborhoodReports - (totalFailed - blockFailed)}`);
  console.log(`Block reports: ${blockGenerated}`);
  console.log(`Total generated: ${totalGenerated}`);
  console.log(`Total failed: ${totalFailed}`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
