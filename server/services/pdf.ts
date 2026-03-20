/**
 * PDF generation service using Puppeteer + headless Chromium.
 *
 * Builds a self-contained HTML string that replicates the FlyerLayout component
 * (src/components/flyer/flyer-layout.tsx) with plain CSS — no Tailwind JIT needed.
 * Puppeteer renders the HTML and captures it as a letter-size PDF.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ SYNC WARNING: This HTML template mirrors FlyerLayout               │
 * │ (src/components/flyer/flyer-layout.tsx). Any visual change to      │
 * │ the React component MUST be reflected here and vice-versa.         │
 * │ Sections to keep in sync: banner, narrative, big numbers, top      │
 * │ issues, good news, languages, get involved, footer.                │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { existsSync } from 'fs';
import puppeteer from 'puppeteer-core';
import QRCode from 'qrcode';
import type { CommunityReport, NeighborhoodProfile } from '../../src/types/index.js';
import { logger } from '../logger.js';
import { truncateSentences } from '../../src/utils/text.js';

// ─── Google Fonts CSS cache ───
// Fetched once and inlined into the HTML to avoid CDN latency on each PDF request.
// The woff2 font files are still loaded by Puppeteer via request interception.
const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;900&family=Noto+Sans+SC:wght@400;700;900&family=Noto+Sans+Arabic:wght@400;700;900&family=Noto+Sans+Vietnamese:wght@400;700&display=swap';
const FONT_CSS_TTL = 24 * 60 * 60 * 1000; // 24 hours
let cachedFontCss: string | null = null;
let fontCssCachedAt = 0;

async function getGoogleFontsCss(): Promise<string> {
  if (cachedFontCss && Date.now() - fontCssCachedAt < FONT_CSS_TTL) return cachedFontCss;
  try {
    const res = await fetch(GOOGLE_FONTS_URL, {
      headers: {
        // Request woff2 format (Chromium user-agent gets the best format)
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('text/css')) {
      // Strip any HTML tags to prevent injection via compromised CDN
      cachedFontCss = (await res.text()).replace(/<[^>]*>/g, '');
      fontCssCachedAt = Date.now();
      return cachedFontCss;
    }
  } catch {
    // Fall through to empty string — fonts will use system fallback
  }
  return cachedFontCss ?? '';
}

let chromiumModule: typeof import('@sparticuz/chromium') | null = null;

async function getChromium() {
  if (!chromiumModule) {
    chromiumModule = await import('@sparticuz/chromium');
  }
  return chromiumModule.default;
}

// Concurrency control — limit to 1 Chromium instance (~200-300MB each).
// Vercel functions have 1024MB; a single instance is the safe limit.
const MAX_CONCURRENT_PDF = 1;
const MAX_QUEUE_DEPTH = 3;
let activePdfJobs = 0;
const pdfQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

async function acquirePdfSlot(): Promise<void> {
  if (activePdfJobs < MAX_CONCURRENT_PDF) {
    activePdfJobs++;
    return;
  }
  if (pdfQueue.length >= MAX_QUEUE_DEPTH) {
    throw new Error('PDF generation queue full — try again later');
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = pdfQueue.indexOf(entry);
      if (idx !== -1) pdfQueue.splice(idx, 1);
      reject(new Error('PDF generation queue timeout — too many concurrent requests'));
    }, 30_000);
    const entry = {
      resolve: () => { clearTimeout(timeout); activePdfJobs++; resolve(); },
      reject,
    };
    pdfQueue.push(entry);
  });
}

function releasePdfSlot(): void {
  activePdfJobs--;
  const next = pdfQueue.shift();
  if (next) next.resolve();
}

export interface PdfOptions {
  report: CommunityReport;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
  neighborhoodSlug: string;
  baseUrl: string;
}

/**
 * Generate a PDF buffer from community report data.
 */
export async function generatePdf(options: PdfOptions): Promise<Buffer> {
  logger.info('PDF generation requested', { neighborhood: options.neighborhoodSlug, queueDepth: pdfQueue.length });
  await acquirePdfSlot();
  const start = Date.now();
  try {
    const pdf = await generatePdfInternal(options);
    logger.info('PDF generation complete', { neighborhood: options.neighborhoodSlug, durationMs: Date.now() - start, sizeBytes: pdf.length });
    return pdf;
  } catch (err) {
    logger.error('PDF generation failed', { neighborhood: options.neighborhoodSlug, durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    releasePdfSlot();
  }
}

// ─── Browser singleton — reuse across warm function invocations ───
let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser(): Promise<Awaited<ReturnType<typeof puppeteer.launch>>> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  const isVercel = !!process.env.VERCEL;
  let executablePath: string;
  let args: string[];

  if (isVercel) {
    const chromium = await getChromium();
    executablePath = await chromium.executablePath();
    args = chromium.args;
  } else {
    executablePath = await findLocalChromium();
    args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ];
  }

  browserInstance = await puppeteer.launch({
    args,
    executablePath,
    headless: true,
  });

  browserInstance.on('disconnected', () => {
    browserInstance = null;
  });

  return browserInstance;
}

async function generatePdfInternal(options: PdfOptions): Promise<Buffer> {
  const html = await buildFlyerHtml(options);
  const browser = await getBrowser();
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

    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 15000 });
    const pdf = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.6in', bottom: '0.5in', left: '0.6in' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Find a locally installed Chromium or Chrome binary. */
async function findLocalChromium(): Promise<string> {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  const candidates = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    'No local Chromium/Chrome found. Install chromium-browser or set CHROME_PATH env var.',
  );
}

// ─── SVG Icons (copied from src/components/flyer/flyer-icons.tsx) ───

const ICON_CHECK_CIRCLE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

const ICON_SMARTPHONE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;

const ICON_BUILDING = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22V12h6v10"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/></svg>`;

const ICON_MAP_PIN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

const ICON_GLOBE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

// ─── Helpers ───

function escapeHtml(value: unknown): string {
  const str = typeof value === 'string' ? value : String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── HTML Template Builder ───

async function buildFlyerHtml(options: PdfOptions): Promise<string> {
  const { report, metrics, topLanguages, neighborhoodSlug, baseUrl } = options;
  const fontCss = await getGoogleFontsCss();

  const formattedDate = new Date(report.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const qrUrl = `${baseUrl}/neighborhood/${neighborhoodSlug}`;
  const qrSvg = await QRCode.toString(qrUrl, { type: 'svg', width: 72, margin: 0 });

  const resolutionPct = metrics ? Math.round(metrics.resolutionRate * 100) : null;
  const avgDays = metrics ? Math.round(metrics.avgDaysToResolve) : null;
  const topIssuesData = metrics?.topIssues.slice(0, 3) ?? [];
  const maxIssueCount = topIssuesData[0]?.count ?? 1;

  const languagesForDisplay = (topLanguages ?? [])
    .filter((l) => l.language !== 'English' && l.percentage > 3)
    .slice(0, 4);

  // Build big number cards
  let bigNumberCards = '';
  if (metrics) {
    bigNumberCards = `
      <div class="big-numbers">
        <div class="big-card">
          <div class="big-value">${metrics.totalRequests311.toLocaleString()}</div>
          <div class="big-label">Issues Reported</div>
        </div>
        <div class="big-card">
          <div class="big-value">${resolutionPct}%</div>
          <div class="big-label">Resolved</div>
        </div>
        <div class="big-card">
          <div class="big-value">${avgDays}</div>
          <div class="big-label">Avg Days to Fix</div>
        </div>
      </div>`;
  }

  // Build top issues section
  let topIssuesHtml: string;
  if (topIssuesData.length > 0) {
    const bars = topIssuesData.map((issue) => `
      <div class="issue-row">
        <div class="issue-header">
          <span class="issue-name">${escapeHtml(issue.category)}</span>
          <span class="issue-count">${issue.count}</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="width: ${(issue.count / maxIssueCount) * 100}%"></div>
        </div>
      </div>`).join('');
    topIssuesHtml = `<div class="issues-bars">${bars}</div>`;
  } else {
    const items = report.topIssues.slice(0, 3).map((item) =>
      `<li class="bullet-item"><span class="bullet">&bull;</span><span>${escapeHtml(item)}</span></li>`
    ).join('');
    topIssuesHtml = `<ul class="bullet-list">${items}</ul>`;
  }

  // Build good news items
  const goodNewsItems = (metrics?.goodNews ?? report.goodNews).slice(0, 2).map((item) =>
    `<li class="check-item"><span class="check-mark">&#10003;</span><span>${escapeHtml(item)}</span></li>`
  ).join('');

  // Build languages section
  let languagesHtml = '';
  if (languagesForDisplay.length > 0) {
    const pills = languagesForDisplay.map((l) =>
      `<span class="lang-pill">${escapeHtml(l.language)} ${Math.round(l.percentage)}%</span>`
    ).join('');
    languagesHtml = `
      <div class="section languages-section">
        <div class="section-header">
          ${ICON_GLOBE}
          <h2 class="section-title">Languages Spoken</h2>
        </div>
        <div class="lang-pills">${pills}</div>
      </div>`;
  }

  // Build get involved items
  const involvedItems = report.howToParticipate.slice(0, 2).map((item) =>
    `<li class="arrow-item"><span class="arrow">&#9656;</span><span>${escapeHtml(item)}</span></li>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Google Fonts — inlined to avoid CDN round-trip per PDF */
    ${fontCss}
  </style>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Noto Sans', 'Noto Sans SC', 'Noto Sans Arabic', 'Noto Sans Vietnamese', system-ui, -apple-system, sans-serif;
      color: #000;
      font-size: 13px;
      line-height: 1.5;
    }

    /* ── TOP BANNER ── */
    .banner {
      border-bottom: 4px solid #000;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .banner-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.35em;
      margin-bottom: 4px;
    }
    .banner h1 {
      font-size: 32px;
      font-weight: 900;
      line-height: 1;
    }
    .banner-date {
      font-size: 15px;
      margin-top: 6px;
      font-weight: 500;
    }

    /* ── NARRATIVE HOOK ── */
    .narrative {
      font-size: 13px;
      line-height: 1.625;
      margin-bottom: 16px;
    }

    /* ── BIG NUMBER CARDS ── */
    .big-numbers {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }
    .big-card {
      border: 2px solid #000;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .big-value {
      font-size: 36px;
      font-weight: 900;
      line-height: 1;
    }
    .big-label {
      font-size: 12px;
      margin-top: 6px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* ── TWO-COLUMN LAYOUT ── */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }

    /* ── TOP ISSUES ── */
    .issues-bars { display: flex; flex-direction: column; gap: 12px; }

    .issue-header {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .issue-name { font-weight: 500; }
    .issue-count { font-weight: 700; font-variant-numeric: tabular-nums; }
    .bar-bg {
      height: 16px;
      background: #e5e7eb;
      border-radius: 2px;
    }
    .bar-fill {
      height: 16px;
      background: #000;
      border-radius: 2px;
    }

    .bullet-list, .check-list { list-style: none; }
    .bullet-item, .check-item, .arrow-item {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .bullet, .arrow { font-weight: 700; flex-shrink: 0; }
    .check-mark { font-weight: 700; flex-shrink: 0; font-size: 15px; line-height: 1; }


    /* ── SECTION TITLES ── */
    .section-title {
      font-size: 15px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .section-title-bordered {
      font-size: 15px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 12px;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    /* ── GOOD NEWS BOX ── */
    .good-news-box {
      border: 2px solid #000;
      border-radius: 8px;
      padding: 12px;
    }
    .good-news-box .check-item { font-size: 12px; }

    /* ── LANGUAGES ── */
    .languages-section { margin-bottom: 20px; }
    .lang-pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .lang-pill {
      border: 2px solid #000;
      border-radius: 9999px;
      padding: 6px 16px;
      font-size: 12px;
      font-weight: 600;
    }

    /* ── GET INVOLVED ── */
    .involved-box {
      border: 2px solid #000;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .involved-box .section-title-bordered {
      margin-bottom: 12px;
    }
    .involved-box ul {
      list-style: none;
      font-size: 12px;
      margin-bottom: 12px;
    }
    .contact-row {
      border-top: 1px solid #000;
      padding-top: 10px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      font-size: 11px;
    }
    .contact-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .contact-item svg { flex-shrink: 0; margin-top: 2px; }
    .contact-label { font-weight: 700; }

    /* ── FOOTER ── */
    .footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      border-top: 2px solid #000;
      padding-top: 12px;
    }
    .footer-text { font-size: 11px; font-weight: 500; }
    .footer-subtext { font-size: 10px; color: #6b7280; }
    .qr-block { display: flex; flex-direction: column; align-items: center; }
    .qr-label { font-size: 9px; margin-top: 4px; text-align: center; font-weight: 500; }
  </style>
</head>
<body>
  <!-- TOP BANNER -->
  <div class="banner">
    <p class="banner-label">Block Report</p>
    <h1>${escapeHtml(report.neighborhoodName)}</h1>
    <p class="banner-date">${escapeHtml(formattedDate)}</p>
  </div>

  <!-- NARRATIVE HOOK -->
  <p class="narrative">${escapeHtml(truncateSentences(report.summary, 2))}</p>

  <!-- BIG NUMBER CARDS -->
  ${bigNumberCards}

  <!-- TWO-COLUMN: TOP ISSUES + GOOD NEWS -->
  <div class="two-col">
    <div>
      <h2 class="section-title-bordered">Top Issues</h2>
      ${topIssuesHtml}
    </div>
    <div class="good-news-box">
      <div class="section-header">
        ${ICON_CHECK_CIRCLE}
        <h2 class="section-title">Good News</h2>
      </div>
      <ul class="check-list">${goodNewsItems}</ul>
    </div>
  </div>

  <!-- LANGUAGES SPOKEN -->
  ${languagesHtml}

  <!-- GET INVOLVED -->
  <div class="involved-box">
    <h2 class="section-title-bordered">Get Involved in ${escapeHtml(report.neighborhoodName)}</h2>
    <ul>${involvedItems}</ul>
    <div class="contact-row">
      <div class="contact-item">
        ${ICON_SMARTPHONE}
        <div>
          <div class="contact-label">Report Issues</div>
          <div>Call 311 / Get It Done app</div>
        </div>
      </div>
      <div class="contact-item">
        ${ICON_BUILDING}
        <div>
          <div class="contact-label">Council Rep</div>
          <div>${escapeHtml(report.contactInfo.councilDistrict)}</div>
        </div>
      </div>
      <div class="contact-item">
        ${ICON_MAP_PIN}
        <div>
          <div class="contact-label">Nearest Resource</div>
          <div>${escapeHtml(report.contactInfo.anchorLocation)}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div>
      <p class="footer-text">Block Report &mdash; Your neighborhood, your voice</p>
      <p class="footer-subtext">Generated ${escapeHtml(formattedDate)} &middot; ${escapeHtml(baseUrl)}/resources</p>
    </div>
    <div class="qr-block">
      ${qrSvg}
      <p class="qr-label">Scan for full report</p>
    </div>
  </div>
</body>
</html>`;
}
