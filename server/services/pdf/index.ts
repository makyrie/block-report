/**
 * PDF generation service using Puppeteer + headless Chromium.
 *
 * Orchestrates browser management, concurrency control, font caching,
 * and HTML template rendering to produce letter-size PDF flyers.
 */

import { logger } from '../../logger.js';
import { getBrowser, closeBrowser } from './browser.js';
import { acquirePdfSlot, releasePdfSlot, getPdfQueueDepth } from './queue.js';
import { buildFlyerHtml } from './template.js';
export type { PdfOptions } from './types.js';
import type { PdfOptions } from './types.js';

/**
 * Generate a PDF buffer from community report data.
 */
export async function generatePdf(options: PdfOptions): Promise<Buffer> {
  logger.info('PDF generation requested', { neighborhood: options.neighborhoodSlug, queueDepth: getPdfQueueDepth() });
  await acquirePdfSlot();
  const start = Date.now();
  try {
    const pdf = await generatePdfInternal(options);
    logger.info('PDF generation complete', { neighborhood: options.neighborhoodSlug, durationMs: Date.now() - start, sizeBytes: pdf.length });
    return pdf;
  } catch (err) {
    logger.error('PDF generation failed', { neighborhood: options.neighborhoodSlug, durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
    throw err;
  } finally {
    releasePdfSlot();
  }
}

async function generatePdfInternal(options: PdfOptions): Promise<Buffer> {
  const html = await buildFlyerHtml(options);
  let browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    // If browser launch fails, ensure cleanup and re-throw
    await closeBrowser();
    throw err;
  }
  const page = await browser.newPage();

  try {
    // Block all external requests — the HTML is self-contained except for fonts
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('https://fonts.googleapis.com/') || url.startsWith('https://fonts.gstatic.com/')) {
        req.continue();
      } else {
        req.abort();
      }
    });

    // Use domcontentloaded instead of networkidle2 to avoid ~500ms idle wait.
    // Font loading is explicitly awaited via document.fonts.ready.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);

    const PDF_TIMEOUT_MS = 10_000;
    const pdfPromise = page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.6in', bottom: '0.5in', left: '0.6in' },
      printBackground: true,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PDF rendering timed out')), PDF_TIMEOUT_MS),
    );
    const pdf = await Promise.race([pdfPromise, timeoutPromise]);
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
