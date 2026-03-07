import { Router } from 'express';

const router = Router();

router.post('/generate', (_req, res) => {
  // TODO: call Claude service to generate brief
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
