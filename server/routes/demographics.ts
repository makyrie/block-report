import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { logger } from '../logger.js';

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

router.get('/', async (req, res) => {
  const tract = req.query.tract as string | undefined;
  const community = req.query.community as string | undefined;

  if (!tract && !community) {
    res.status(400).json({ error: 'tract or community query parameter is required' });
    return;
  }

  // Single tract lookup
  if (tract) {
    const { data, error } = await supabase
      .from('census_language')
      .select('*')
      .eq('tract', tract)
      .single();

    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      if (status === 500) {
        logger.error('Failed to fetch demographics', { error: error.message, tract });
      }
      res.status(status).json({
        error: error.code === 'PGRST116' ? 'Tract not found' : 'Internal server error',
      });
      return;
    }

    res.json({ topLanguages: computeTopLanguages([data]) });
    return;
  }

  // Strip SQL wildcards and enforce length
  const cleaned = community!.replace(/[%_]/g, '');
  if (cleaned.length > 100 || cleaned.length === 0) {
    res.status(400).json({ error: 'Invalid community name' });
    return;
  }

  // Community-based lookup: find all tracts for this community
  // Try matching community name in the census data
  const { data, error } = await supabase
    .from('census_language')
    .select('*')
    .ilike('community', cleaned);

  if (error) {
    logger.error('Failed to fetch demographics by community', { error: error.message, community });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  if (!data || data.length === 0) {
    // Fall back: return empty rather than 404 so the frontend degrades gracefully
    res.json({ topLanguages: [] });
    return;
  }

  res.json({ topLanguages: computeTopLanguages(data as Record<string, unknown>[]) });
});

export default router;
