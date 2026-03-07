import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateBrief } from '../services/claude.js';
import { logger } from '../logger.js';
import type { NeighborhoodProfile } from '../../src/types/index.js';

const router = Router();

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { profile, language } = req.body as {
      profile: NeighborhoodProfile;
      language: string;
    };

    if (!profile || !language) {
      res.status(400).json({ error: 'Missing required fields: profile, language' });
      return;
    }

    const brief = await generateBrief(profile, language);
    res.json(brief);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error generating brief';
    logger.error('Brief generation error', {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
