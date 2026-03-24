import app from './app.js';
import { logger } from './logger.js';
import { getTransitScores } from './services/transit-scores.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);

  // Pre-warm transit score cache in the background so the first user request is fast
  getTransitScores().catch((err) => {
    logger.warn('Transit score pre-warm failed (will compute on first request)', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
});
