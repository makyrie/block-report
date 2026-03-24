/**
 * Browser singleton management with crash recovery.
 *
 * Maintains a single Chromium instance across warm function invocations.
 * Detects zombie/disconnected browsers and recycles them automatically.
 */

import { existsSync } from 'fs';
import puppeteer from 'puppeteer-core';
import { logger } from '../../logger.js';

type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;

let chromiumModule: typeof import('@sparticuz/chromium') | null = null;

async function getChromium() {
  if (!chromiumModule) {
    chromiumModule = await import('@sparticuz/chromium');
  }
  return chromiumModule.default;
}

let browserInstance: Browser | null = null;

/**
 * Get or create a browser instance with crash recovery.
 * If the existing browser is disconnected or in a bad state, it is
 * force-killed and a fresh instance is launched.
 */
export async function getBrowser(): Promise<Browser> {
  if (browserInstance) {
    try {
      if (!browserInstance.connected) {
        logger.warn('Browser singleton disconnected — recycling');
        await closeBrowser();
      }
    } catch {
      logger.warn('Browser singleton in bad state — recycling');
      await closeBrowser();
    }
  }

  if (browserInstance) {
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

/**
 * Force-close the browser singleton, killing the process if close() fails.
 * Safe to call even if no browser is running.
 */
export async function closeBrowser(): Promise<void> {
  if (!browserInstance) return;
  const browser = browserInstance;
  browserInstance = null;
  try {
    await browser.close();
  } catch {
    // Force-kill the browser process if close() fails
    try {
      const proc = browser.process();
      if (proc) proc.kill('SIGKILL');
    } catch {
      // Already dead — nothing to clean up
    }
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
