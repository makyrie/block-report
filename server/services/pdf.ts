import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CommunityReport, NeighborhoodProfile } from '../../src/types/index.js';
import { logger } from '../logger.js';
import { isServerless } from '../env.js';

// Lazy-load Puppeteer to avoid import cost on non-PDF routes
let launchBrowser: (() => Promise<import('puppeteer-core').Browser>) | null = null;

async function getLauncher(): Promise<() => Promise<import('puppeteer-core').Browser>> {
  if (launchBrowser) return launchBrowser;

  const puppeteer = await import('puppeteer-core');

  // In serverless (Vercel), use @sparticuz/chromium; locally, use system Chromium
  if (isServerless) {
    const chromium = await import('@sparticuz/chromium');
    launchBrowser = async () => {
      const executablePath = await chromium.default.executablePath();
      return puppeteer.default.launch({
        args: chromium.default.args,
        defaultViewport: chromium.default.defaultViewport,
        executablePath,
        headless: true,
      });
    };
  } else {
    // Local development: look for system Chromium/Chrome
    launchBrowser = async () => {
      const possiblePaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/snap/bin/chromium',
      ];
      let executablePath: string | undefined;
      for (const p of possiblePaths) {
        try {
          const { accessSync } = await import('node:fs');
          accessSync(p);
          executablePath = p;
          break;
        } catch { /* try next */ }
      }
      return puppeteer.default.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    };
  }

  return launchBrowser;
}

// Reuse browser across warm requests to avoid cold-start cost per PDF
let _browser: import('puppeteer-core').Browser | null = null;

async function getBrowser(): Promise<import('puppeteer-core').Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  const launcher = await getLauncher();
  _browser = await launcher();
  return _browser;
}

// Clean up browser on process exit
function disposeBrowser() {
  if (_browser) {
    _browser.close().catch(() => {});
    _browser = null;
  }
}
process.on('SIGTERM', disposeBrowser);
process.on('SIGINT', disposeBrowser);
process.on('beforeExit', disposeBrowser);

export interface PdfRequest {
  report: CommunityReport;
  neighborhoodSlug: string;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
  baseUrl: string;
}

/**
 * Render the FlyerLayout component to a static HTML string on the server.
 * We dynamically import the component to avoid bundling React client code in the server entry.
 */
async function renderFlyerHtml(data: PdfRequest): Promise<string> {
  // Dynamic import of the flyer component — tsx transpiles JSX at runtime
  const { FlyerLayout } = await import('../../src/components/flyer/flyer-layout.js');

  const element = createElement(FlyerLayout, {
    report: data.report,
    neighborhoodSlug: data.neighborhoodSlug,
    metrics: data.metrics,
    topLanguages: data.topLanguages,
    inline: true,
    baseUrl: data.baseUrl,
  });

  return renderToStaticMarkup(element);
}

/** Get the Google Fonts URL for the language — only load what's needed. */
function getFontUrl(language: string): string {
  const base = 'https://fonts.googleapis.com/css2?';
  switch (language) {
    case 'Chinese':
      return `${base}family=Noto+Sans+SC:wght@400;500;700;900&display=swap`;
    case 'Arabic':
      return `${base}family=Noto+Sans+Arabic:wght@400;500;600;700;900&display=swap`;
    default:
      return `${base}family=Noto+Sans:wght@400;500;600;700;900&display=swap`;
  }
}

/**
 * Pre-compiled Tailwind utility CSS for the flyer layout.
 * Eliminates the CDN dependency entirely — no external JS loaded during PDF render.
 */
const FLYER_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { margin: 0; padding: 0; font-family: 'Noto Sans', 'Noto Sans SC', 'Noto Sans Arabic', system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #000; }
.flyer-layout { display: block !important; }
svg { display: inline-block; vertical-align: middle; }
.hidden { display: none; }
.text-black { color: #000; }
.text-gray-600 { color: #4b5563; }
.font-sans { font-family: 'Noto Sans', 'Noto Sans SC', 'Noto Sans Arabic', system-ui, sans-serif; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.font-black { font-weight: 900; }
.text-\\[9px\\] { font-size: 9px; }
.text-\\[10px\\] { font-size: 10px; }
.text-\\[11px\\] { font-size: 11px; }
.text-\\[12px\\] { font-size: 12px; }
.text-\\[13px\\] { font-size: 13px; }
.text-\\[15px\\] { font-size: 15px; }
.text-\\[32px\\] { font-size: 32px; }
.text-\\[36px\\] { font-size: 36px; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.leading-none { line-height: 1; }
.leading-relaxed { line-height: 1.625; }
.uppercase { text-transform: uppercase; }
.tracking-wide { letter-spacing: 0.025em; }
.tracking-widest { letter-spacing: 0.1em; }
.tracking-\\[0\\.35em\\] { letter-spacing: 0.35em; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.text-center { text-align: center; }
.border-black { border-color: #000; }
.border-gray-200 { border-color: #e5e7eb; }
.border-2 { border-width: 2px; border-style: solid; }
.border-b-4 { border-bottom: 4px solid; }
.border-b-2 { border-bottom: 2px solid; }
.border-b { border-bottom: 1px solid; }
.border-t-2 { border-top: 2px solid; }
.border-t { border-top: 1px solid; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-sm { border-radius: 0.125rem; }
.rounded-full { border-radius: 9999px; }
.bg-black { background-color: #000; }
.bg-gray-200 { background-color: #e5e7eb; }
.bg-white { background-color: #fff; }
.p-3 { padding: 0.75rem; }
.p-4 { padding: 1rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.pb-1 { padding-bottom: 0.25rem; }
.pb-1\\.5 { padding-bottom: 0.375rem; }
.pb-3 { padding-bottom: 0.75rem; }
.pt-2\\.5 { padding-top: 0.625rem; }
.pt-3 { padding-top: 0.75rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-3 { margin-bottom: 0.75rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-5 { margin-bottom: 1.25rem; }
.mt-0\\.5 { margin-top: 0.125rem; }
.mt-1 { margin-top: 0.25rem; }
.mt-1\\.5 { margin-top: 0.375rem; }
.h-4 { height: 1rem; }
.w-4 { width: 1rem; }
.w-5 { width: 1.25rem; }
.h-5 { height: 1.25rem; }
.flex { display: flex; }
.grid { display: grid; }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.flex-shrink-0 { flex-shrink: 0; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.items-end { align-items: flex-end; }
.justify-between { justify-content: space-between; }
.gap-1 { gap: 0.25rem; }
.gap-1\\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }
.gap-5 { gap: 1.25rem; }
.space-y-1\\.5 > * + * { margin-top: 0.375rem; }
.space-y-2 > * + * { margin-top: 0.5rem; }
.space-y-3 > * + * { margin-top: 0.75rem; }
.list-none { list-style: none; padding-left: 0; }
`;

/**
 * Build a full HTML page with pre-compiled CSS for the flyer.
 * Loads only the Google Fonts family needed for the target language.
 */
function buildHtmlPage(bodyHtml: string, language: string): string {
  const isRtl = language === 'Arabic';
  const dir = isRtl ? 'rtl' : 'ltr';
  const fontUrl = getFontUrl(language);

  return `<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${fontUrl}" rel="stylesheet">
  <style>${FLYER_CSS}</style>
</head>
<body>
  <div style="width: 612px; padding: 48px 56px;">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

const PDF_TIMEOUT_MS = 45_000; // 45s internal timeout (Vercel hard limit is 60s)

/**
 * Generate a PDF buffer from the flyer data.
 * Launches headless Chromium, renders the React component as HTML, and exports to PDF.
 */
export async function generateFlyerPdf(data: PdfRequest): Promise<Buffer> {
  const startTime = Date.now();
  let page: import('puppeteer-core').Page | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    // Race the entire operation against an internal timeout
    const result = await Promise.race([
      (async () => {
        const browser = await getBrowser();
        logger.info('Chromium ready', { durationMs: Date.now() - startTime });

        const bodyHtml = await renderFlyerHtml(data);
        const fullHtml = buildHtmlPage(bodyHtml, data.report.language);

        page = await browser.newPage();

        // Restrict network requests to allowlisted domains (prevents SSRF)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const url = new URL(req.url());
          const allowed = [
            'fonts.googleapis.com',
            'fonts.gstatic.com',
          ];
          if (allowed.includes(url.hostname) || url.protocol === 'data:') {
            req.continue();
          } else {
            req.abort();
          }
        });

        await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30_000 });

        const pdfBuffer = await page.pdf({
          format: 'letter',
          printBackground: true,
          margin: { top: '0', bottom: '0', left: '0', right: '0' },
        });

        logger.info('PDF generated', {
          durationMs: Date.now() - startTime,
          sizeBytes: pdfBuffer.length,
          language: data.report.language,
        });

        return Buffer.from(pdfBuffer);
      })(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('PDF generation timed out')), PDF_TIMEOUT_MS);
      }),
    ]);

    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (page) {
      try {
        await (page as import('puppeteer-core').Page).close();
      } catch (err) {
        logger.error('Failed to close page', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
