import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }
  // TODO: fetch and aggregate 311 data from SODA API
  res.json({});
});

export default router;
