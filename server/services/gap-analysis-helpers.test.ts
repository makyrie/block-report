import { describe, it, expect } from 'vitest';
import { minMax, arrayMin, arrayMax } from './gap-analysis';

describe('minMax', () => {
  it('normalizes value within range to 0-1', () => {
    expect(minMax(50, 0, 100)).toBe(0.5);
    expect(minMax(0, 0, 100)).toBe(0);
    expect(minMax(100, 0, 100)).toBe(1);
  });

  it('clamps values outside range', () => {
    expect(minMax(-10, 0, 100)).toBe(0);
    expect(minMax(200, 0, 100)).toBe(1);
  });

  it('returns 0 when min equals max', () => {
    expect(minMax(5, 5, 5)).toBe(0);
  });
});

describe('arrayMin', () => {
  it('returns minimum value from array', () => {
    expect(arrayMin([3, 1, 4, 1, 5])).toBe(1);
  });

  it('returns Infinity for empty array', () => {
    expect(arrayMin([])).toBe(Infinity);
  });

  it('handles single element', () => {
    expect(arrayMin([42])).toBe(42);
  });

  it('handles negative values', () => {
    expect(arrayMin([-5, -1, -10])).toBe(-10);
  });
});

describe('arrayMax', () => {
  it('returns maximum value from array', () => {
    expect(arrayMax([3, 1, 4, 1, 5])).toBe(5);
  });

  it('returns -Infinity for empty array', () => {
    expect(arrayMax([])).toBe(-Infinity);
  });

  it('handles single element', () => {
    expect(arrayMax([42])).toBe(42);
  });

  it('handles negative values', () => {
    expect(arrayMax([-5, -1, -10])).toBe(-1);
  });
});
