import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  const tract = req.query.tract as string | undefined;
  if (!tract) {
    res.status(400).json({ error: 'tract query parameter is required' });
    return;
  }
  // TODO: fetch Census language data
  res.json({});
});

export default router;
