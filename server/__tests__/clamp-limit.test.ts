import { describe, it, expect } from 'vitest';
import { clampLimit } from '../clamp-limit';

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

  it('clamps zero to 1 (minimum valid limit)', () => {
    expect(clampLimit(0)).toBe(1);
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

  it('floors fractional values to integers', () => {
    expect(clampLimit(3.7)).toBe(3);
    expect(clampLimit('10.9')).toBe(10);
  });
});
