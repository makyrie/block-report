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

/**
 * Build a full HTML page with inlined Tailwind-like styles for the flyer.
 * Uses Google Fonts CDN for Noto Sans (Latin, Arabic) and Noto Sans SC (Chinese).
 */
function buildHtmlPage(bodyHtml: string, language: string): string {
  const isRtl = language === 'Arabic';
  const dir = isRtl ? 'rtl' : 'ltr';

  return `<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;0,900;1,400&family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Sans+Arabic:wght@400;500;600;700;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Noto Sans', 'Noto Sans SC', 'Noto Sans Arabic', system-ui, -apple-system, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .flyer-layout { display: block !important; }
    /* Ensure SVG icons render with correct stroke */
    svg { display: inline-block; vertical-align: middle; }
  </style>
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
            'cdn.tailwindcss.com',
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
