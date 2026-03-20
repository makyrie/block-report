import app from './app.js';
import { logger } from './logger.js';

// Validate APP_URL is a well-formed URL if set (required for PDF QR code generation)
if (process.env.APP_URL) {
  try {
    new URL(process.env.APP_URL);
  } catch {
    logger.error('APP_URL environment variable is not a valid URL', { value: process.env.APP_URL });
    process.exit(1);
  }
} else {
  logger.warn('APP_URL environment variable is not set — PDF generation will be unavailable');
}

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
