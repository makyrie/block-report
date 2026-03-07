import { Router } from 'express';
import { supabase } from '../services/supabase.js';

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

router.get('/', async (req, res) => {
  const tract = req.query.tract as string | undefined;
  if (!tract) {
    res.status(400).json({ error: 'tract query parameter is required' });
    return;
  }

  const { data, error } = await supabase
    .from('census_language')
    .select('*')
    .eq('tract', tract)
    .single();

  if (error) {
    res.status(error.code === 'PGRST116' ? 404 : 500).json({
      error: error.code === 'PGRST116' ? 'Tract not found' : error.message,
    });
    return;
  }

  const total = data.total_pop_5plus || 1;
  const topLanguages = LANGUAGE_FIELDS.map((f) => ({
    language: f.label,
    percentage:
      Math.round(((data[f.column as keyof typeof data] as number) / total) * 1000) / 10,
  }))
    .filter((l) => l.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage);

  res.json({ topLanguages });
});

export default router;
