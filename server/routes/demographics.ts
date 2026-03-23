import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { validateCommunityParam } from '../utils/community.js';

const router = Router();

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

function computeTopLanguages(rows: Record<string, unknown>[]) {
  // Aggregate across all rows (tracts)
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

// Tract IDs are numeric (state+county+tract), e.g. "06073008346"
const TRACT_RE = /^\d{6,11}$/;

router.get('/', async (req, res) => {
  const tract = req.query.tract as string | undefined;
  const rawCommunity = req.query.community as string | undefined;

  if (!tract && !rawCommunity) {
    res.status(400).json({ error: 'tract or community query parameter is required' });
    return;
  }

  // Validate tract format
  if (tract && !TRACT_RE.test(tract)) {
    res.status(400).json({ error: 'Invalid tract format — expected a numeric census tract ID' });
    return;
  }

  // Validate community parameter using shared utility
  const community = rawCommunity ? validateCommunityParam(rawCommunity) : null;
  if (rawCommunity && !community) {
    res.status(400).json({ error: 'Invalid community parameter' });
    return;
  }

  // Single tract lookup
  if (tract) {
    try {
      const data = await prisma.censusLanguage.findUnique({ where: { tract } });
      if (!data) {
        res.status(404).json({ error: 'Tract not found' });
        return;
      }
      res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.json({ topLanguages: computeTopLanguages([data as Record<string, unknown>]) });
      return;
    } catch (err) {
      logger.error('Failed to fetch demographics', { error: err instanceof Error ? err.message : String(err), tract });
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }

  // TODO: community-to-tract crosswalk not yet implemented.
  // census_language is keyed by tract only. A TIGER/Line spatial join or static
  // crosswalk table is needed to map community plan names → tract IDs.
  // Return empty so the frontend degrades gracefully rather than throwing 500.
  logger.warn('Demographics by community requested but crosswalk not implemented', { community });
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.json({ topLanguages: [] });
});

export default router;
