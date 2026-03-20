import { describe, it, expect } from 'vitest';

/** Replicate the limit clamping logic from gap-analysis ranking route. */
function clampLimit(raw: unknown): number {
  return Math.max(1, Math.min(Number(raw) || 10, 100));
}

describe('limit clamping (gap-analysis ranking)', () => {
  it('defaults to 10 for undefined', () => {
    expect(clampLimit(undefined)).toBe(10);
  });

  it('defaults to 10 for non-numeric string', () => {
    expect(clampLimit('abc')).toBe(10);
  });

  it('clamps negative numbers to 1', () => {
    expect(clampLimit(-5)).toBe(1);
  });

  it('clamps zero to 10 (falsy → default)', () => {
    expect(clampLimit(0)).toBe(10);
  });

  it('caps at 100', () => {
    expect(clampLimit(999)).toBe(100);
  });

  it('accepts valid values', () => {
    expect(clampLimit(50)).toBe(50);
    expect(clampLimit('25')).toBe(25);
  });

  it('floors at 1 for negative string', () => {
    expect(clampLimit('-10')).toBe(1);
  });
});
