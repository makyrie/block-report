// Census API client for language demographics
// Data workstream owns this file

import { getCached, setCache } from '../cache.js';

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '763fa6e6daf21d98f76cfc93e760fe4cb76aa316';

interface LanguageEntry {
  language: string;
  percentage: number;
}

interface LanguageData {
  topLanguages: LanguageEntry[];
}

// Map Census field codes to human-readable language names
const LANGUAGE_FIELDS: Record<string, string> = {
  C16001_002E: 'English only',
  C16001_003E: 'Spanish',
  C16001_006E: 'French/Haitian/Cajun',
  C16001_009E: 'German/West Germanic',
  C16001_012E: 'Russian/Polish/Slavic',
  C16001_015E: 'Korean',
  C16001_018E: 'Chinese',
  C16001_021E: 'Vietnamese',
  C16001_024E: 'Tagalog',
  C16001_027E: 'Arabic',
  C16001_030E: 'Other/unspecified',
};

const FIELDS = [
  'C16001_001E', // Total pop 5+
  ...Object.keys(LANGUAGE_FIELDS),
];

export async function fetchLanguageData(tract: string): Promise<LanguageData> {
  const cacheKey = `census:language:${tract}`;
  const cached = await getCached<LanguageData>(cacheKey);
  if (cached) return cached;

  const fieldList = FIELDS.join(',');
  const url = `https://api.census.gov/data/2021/acs/acs5?get=${fieldList}&for=tract:${tract}&in=state:06&in=county:073&key=${CENSUS_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Census API failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as string[][];

  // Census API returns [headers, ...dataRows]
  if (!data || data.length < 2) {
    throw new Error(`No Census data found for tract ${tract}`);
  }

  const headers = data[0];
  const values = data[1];

  // Build a lookup from header name to value
  const lookup: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    lookup[headers[i]] = Number(values[i]) || 0;
  }

  const totalPop = lookup['C16001_001E'] || 0;
  if (totalPop === 0) {
    const result: LanguageData = { topLanguages: [] };
    await setCache(cacheKey, result);
    return result;
  }

  const topLanguages: LanguageEntry[] = [];

  for (const [fieldCode, languageName] of Object.entries(LANGUAGE_FIELDS)) {
    const count = lookup[fieldCode] || 0;
    const percentage = Math.round((count / totalPop) * 1000) / 10; // one decimal place
    if (percentage > 0) {
      topLanguages.push({ language: languageName, percentage });
    }
  }

  // Sort descending by percentage
  topLanguages.sort((a, b) => b.percentage - a.percentage);

  const result: LanguageData = { topLanguages };
  await setCache(cacheKey, result);
  return result;
}
