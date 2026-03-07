import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

router.get('/libraries', async (_req, res) => {
  const { data, error } = await supabase.from('libraries').select('*');
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

router.get('/rec-centers', async (_req, res) => {
  const { data, error } = await supabase.from('rec_centers').select('*');
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

router.get('/transit-stops', async (_req, res) => {
  const { data, error } = await supabase.from('transit_stops').select('*');
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

export default router;
