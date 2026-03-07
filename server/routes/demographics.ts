import { Router } from 'express';
import { fetchLanguageData } from '../services/census.js';

const router = Router();

router.get('/', async (req, res) => {
  const tract = req.query.tract as string | undefined;
  if (!tract) {
    res.status(400).json({ error: 'tract query parameter is required' });
    return;
  }

  try {
    const demographics = await fetchLanguageData(tract);
    res.json(demographics);
  } catch (error) {
    console.error('Error fetching demographics:', error);
    res.status(500).json({ error: 'Failed to fetch demographic data' });
  }
});

export default router;
