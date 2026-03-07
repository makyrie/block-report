import { Router } from 'express';
import { fetchLibraries, fetchRecCenters, fetchTransitStops } from '../services/soda.js';

const router = Router();

router.get('/libraries', async (_req, res) => {
  try {
    const libraries = await fetchLibraries();
    res.json(libraries);
  } catch (error) {
    console.error('Error fetching libraries:', error);
    res.status(500).json({ error: 'Failed to fetch library data' });
  }
});

router.get('/rec-centers', async (_req, res) => {
  try {
    const centers = await fetchRecCenters();
    res.json(centers);
  } catch (error) {
    console.error('Error fetching rec centers:', error);
    res.status(500).json({ error: 'Failed to fetch recreation center data' });
  }
});

router.get('/transit-stops', async (_req, res) => {
  try {
    const stops = await fetchTransitStops();
    res.json(stops);
  } catch (error) {
    console.error('Error fetching transit stops:', error);
    res.status(500).json({ error: 'Failed to fetch transit stop data' });
  }
});

export default router;
