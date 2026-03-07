import { Router } from 'express';

const router = Router();

router.get('/libraries', (_req, res) => {
  // TODO: fetch from SODA API via soda service
  res.json([]);
});

router.get('/rec-centers', (_req, res) => {
  // TODO: fetch from SODA API via soda service
  res.json([]);
});

router.get('/transit-stops', (_req, res) => {
  // TODO: fetch transit stop data
  res.json([]);
});

export default router;
