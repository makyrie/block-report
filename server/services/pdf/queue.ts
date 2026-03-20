/**
 * PDF generation concurrency queue.
 *
 * Limits to 1 concurrent Chromium instance (~200-300MB each).
 * Vercel functions have 1024MB; a single instance is the safe limit.
 */

const MAX_CONCURRENT_PDF = 1;
const MAX_QUEUE_DEPTH = 3;
// 15s timeout — leaves headroom for the actual PDF generation within
// Vercel's 30s function timeout. A 30s queue timeout would mean dequeued
// jobs have zero time left to complete.
const QUEUE_TIMEOUT_MS = 15_000;

let activePdfJobs = 0;
const pdfQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

export async function acquirePdfSlot(): Promise<void> {
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
    }, QUEUE_TIMEOUT_MS);
    const entry = {
      resolve: () => { clearTimeout(timeout); activePdfJobs++; resolve(); },
      reject,
    };
    pdfQueue.push(entry);
  });
}

export function getPdfQueueDepth(): number {
  return pdfQueue.length;
}

export function releasePdfSlot(): void {
  activePdfJobs--;
  const next = pdfQueue.shift();
  if (next) next.resolve();
}
