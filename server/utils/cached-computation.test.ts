import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCachedComputation } from './cached-computation';

describe('createCachedComputation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns computed value', async () => {
    const compute = vi.fn().mockResolvedValue(42);
    const cached = createCachedComputation(compute, 1000);
    const result = await cached.get();
    expect(result).toBe(42);
    expect(compute).toHaveBeenCalledOnce();
  });

  it('returns cached value on subsequent calls within TTL', async () => {
    const compute = vi.fn().mockResolvedValue('data');
    const cached = createCachedComputation(compute, 10_000);
    await cached.get();
    await cached.get();
    await cached.get();
    expect(compute).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent calls into a single computation', async () => {
    let resolveCompute!: (v: string) => void;
    const compute = vi.fn().mockReturnValue(
      new Promise<string>((r) => { resolveCompute = r; }),
    );
    const cached = createCachedComputation(compute, 10_000);
    const p1 = cached.get();
    const p2 = cached.get();
    resolveCompute('shared');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('shared');
    expect(r2).toBe('shared');
    expect(compute).toHaveBeenCalledOnce();
  });

  it('allows retry after failure', async () => {
    const compute = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');
    const cached = createCachedComputation(compute, 10_000);
    await expect(cached.get()).rejects.toThrow('fail');
    const result = await cached.get();
    expect(result).toBe('ok');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('recomputes after TTL expires', async () => {
    vi.useFakeTimers();
    const compute = vi.fn()
      .mockResolvedValueOnce('fresh')
      .mockResolvedValueOnce('refreshed');
    const cached = createCachedComputation(compute, 1000);
    expect(await cached.get()).toBe('fresh');
    expect(compute).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    expect(await cached.get()).toBe('refreshed');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('invalidate forces recomputation', async () => {
    const compute = vi.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const cached = createCachedComputation(compute, 10_000);
    expect(await cached.get()).toBe('first');
    cached.invalidate();
    expect(await cached.get()).toBe('second');
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
