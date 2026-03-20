import { prisma } from './db.js';

const LANGUAGE_FIELDS: { column: string; label: string }[] = [
  { column: 'english_only', label: 'English' },
  { column: 'spanish', label: 'Spanish' },
  { column: 'chinese', label: 'Chinese' },
  { column: 'vietnamese', label: 'Vietnamese' },
  { column: 'tagalog', label: 'Tagalog' },
  { column: 'korean', label: 'Korean' },
  { column: 'arabic', label: 'Arabic' },
  { column: 'french_haitian_cajun', label: 'French/Haitian/Cajun' },
  { column: 'german_west_germanic', label: 'German/West Germanic' },
  { column: 'russian_polish_slavic', label: 'Russian/Polish/Slavic' },
  { column: 'other_unspecified', label: 'Other' },
];

export interface LanguageBreakdown {
  language: string;
  percentage: number;
}

export function computeTopLanguages(rows: Record<string, unknown>[]): LanguageBreakdown[] {
  let totalPop = 0;
  const langTotals: Record<string, number> = {};

  for (const row of rows) {
    const pop = Number(row.total_pop_5plus) || 0;
    totalPop += pop;
    for (const f of LANGUAGE_FIELDS) {
      langTotals[f.label] = (langTotals[f.label] || 0) + (Number(row[f.column]) || 0);
    }
  }

  if (totalPop === 0) return [];

  return LANGUAGE_FIELDS.map((f) => ({
    language: f.label,
    percentage: Math.round((langTotals[f.label] / totalPop) * 1000) / 10,
  }))
    .filter((l) => l.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage);
}

export async function getDemographicsByTract(tract: string): Promise<LanguageBreakdown[]> {
  const data = await prisma.censusLanguage.findUnique({ where: { tract } });
  if (!data) return [];
  return computeTopLanguages([data as Record<string, unknown>]);
}

export async function getDemographicsByCommunity(communityName: string): Promise<LanguageBreakdown[]> {
  const key = communityName.toUpperCase().trim();
  const rows = await prisma.censusLanguage.findMany({
    where: {
      community: {
        equals: key,
        mode: 'insensitive',
      },
    },
  });

  if (rows.length === 0) return [];
  return computeTopLanguages(rows as Record<string, unknown>[]);
}
