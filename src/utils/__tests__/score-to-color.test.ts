import { describe, it, expect } from 'vitest';
import { scoreToColor } from '../score-to-color';

describe('scoreToColor', () => {
  it('returns gray for null', () => {
    expect(scoreToColor(null)).toBe('#d1d5db');
  });

  it('returns green for scores below 20', () => {
    expect(scoreToColor(0)).toBe('#22c55e');
    expect(scoreToColor(19)).toBe('#22c55e');
  });

  it('returns lime for scores 20–39', () => {
    expect(scoreToColor(20)).toBe('#a3e635');
    expect(scoreToColor(39)).toBe('#a3e635');
  });

  it('returns yellow for scores 40–59', () => {
    expect(scoreToColor(40)).toBe('#facc15');
    expect(scoreToColor(59)).toBe('#facc15');
  });

  it('returns orange for scores 60–79', () => {
    expect(scoreToColor(60)).toBe('#f97316');
    expect(scoreToColor(79)).toBe('#f97316');
  });

  it('returns red for scores 80+', () => {
    expect(scoreToColor(80)).toBe('#ef4444');
    expect(scoreToColor(100)).toBe('#ef4444');
  });

  it('handles negative scores as green', () => {
    expect(scoreToColor(-5)).toBe('#22c55e');
  });
});
