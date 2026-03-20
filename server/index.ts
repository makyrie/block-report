import app from './app.js';
import { logger } from './logger.js';
import { closeBrowser } from './services/pdf/browser.js';

// Validate APP_URL is a well-formed URL if set (required for PDF QR code generation)
if (process.env.APP_URL) {
  try {
    const parsed = new URL(process.env.APP_URL);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      logger.error('APP_URL must use http or https protocol', { value: process.env.APP_URL });
      process.exit(1);
    }
  } catch {
    logger.error('APP_URL environment variable is not a valid URL', { value: process.env.APP_URL });
    process.exit(1);
  }
} else {
  logger.warn('APP_URL environment variable is not set — PDF generation will be unavailable');
}

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
