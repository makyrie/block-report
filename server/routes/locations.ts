import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { logger } from '../logger.js';

const router = Router();

// In-memory cache for the community plan GeoJSON (~4 MB, fetched once)
const NEIGHBORHOODS_URL =
  'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson';
const NEIGHBORHOODS_TTL = 24 * 60 * 60 * 1000;
let neighborhoodsCache: Record<string, unknown> | null = null;
let neighborhoodsCachedAt = 0;

router.get('/libraries', async (_req, res) => {
  const { data, error } = await supabase.from('libraries').select('*');
  if (error) {
    logger.error('Failed to fetch libraries', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
  res.json(data);
});

router.get('/rec-centers', async (_req, res) => {
  const { data, error } = await supabase.from('rec_centers').select('*');
  if (error) {
    logger.error('Failed to fetch rec centers', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
  res.json(data);
});

router.get('/transit-stops', async (_req, res) => {
  const { data, error } = await supabase.from('transit_stops').select('objectid, stop_name, lat, lng');
  if (error) {
    logger.error('Failed to fetch transit stops', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
  res.json(data);
});

router.get('/neighborhoods', async (_req, res) => {
  const now = Date.now();
  if (neighborhoodsCache && now - neighborhoodsCachedAt < NEIGHBORHOODS_TTL) {
    res.json(neighborhoodsCache);
    return;
  }
  try {
    const response = await fetch(NEIGHBORHOODS_URL);
    if (!response.ok) throw new Error(`Upstream error: ${response.status}`);
    const data = await response.json();
    neighborhoodsCache = data;
    neighborhoodsCachedAt = now;
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch neighborhoods', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
