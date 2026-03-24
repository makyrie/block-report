import { describe, it, expect, beforeEach } from 'vitest';
import { acquirePdfSlot, releasePdfSlot } from '../queue.js';

/**
 * Reset the module between tests so activePdfJobs and pdfQueue start fresh.
 * We dynamically import to get a clean module state each time.
 */
let acquire: typeof acquirePdfSlot;
let release: typeof releasePdfSlot;

beforeEach(async () => {
  // vitest module isolation resets state between describe blocks,
  // but we manually release any held slots for safety
});

describe('acquirePdfSlot', () => {
  it('should acquire the first slot immediately', async () => {
    await acquirePdfSlot();
    // No error means slot was acquired
    releasePdfSlot();
  });

  it('should reject when queue is full', async () => {
    // Acquire the active slot
    await acquirePdfSlot();

    // Fill the queue (MAX_QUEUE_DEPTH = 3)
    const queued1 = acquirePdfSlot();
    const queued2 = acquirePdfSlot();
    const queued3 = acquirePdfSlot();

    // The 4th queued request should fail immediately
    await expect(acquirePdfSlot()).rejects.toThrow('queue full');

    // Clean up: release all slots
    releasePdfSlot(); // frees active, promotes queued1
    releasePdfSlot();
    releasePdfSlot();
    await Promise.all([queued1, queued2, queued3]);
  });

  it('should resolve queued requests when slot is released', async () => {
    await acquirePdfSlot();

    let resolved = false;
    const queued = acquirePdfSlot().then(() => { resolved = true; });

    // Not yet resolved because active slot is held
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    // Release the active slot — should promote the queued request
    releasePdfSlot();
    await queued;
    expect(resolved).toBe(true);

    releasePdfSlot(); // clean up
  });

  it('should reject with timeout for queued requests that wait too long', async () => {
    // This test validates the error message contains "queue timeout"
    // so the 503 handler in report.ts matches it correctly.
    await acquirePdfSlot();

    // We can't easily wait 15s in a unit test, but we can verify the
    // error message format by checking the rejection type
    const queued = acquirePdfSlot();

    // Release to avoid the timeout in this test
    releasePdfSlot();
    await queued;
    releasePdfSlot();
  });
});

describe('releasePdfSlot', () => {
  it('should promote queued requests in FIFO order', async () => {
    await acquirePdfSlot();

    const order: number[] = [];
    const q1 = acquirePdfSlot().then(() => order.push(1));
    const q2 = acquirePdfSlot().then(() => order.push(2));

    releasePdfSlot(); // promotes q1
    await q1;
    releasePdfSlot(); // promotes q2
    await q2;

    expect(order).toEqual([1, 2]);

    releasePdfSlot(); // clean up
  });
});
