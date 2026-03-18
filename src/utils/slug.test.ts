import { describe, it, expect } from 'vitest';
import { toSlug, fromSlug } from './slug';

describe('toSlug', () => {
  it('converts name to lowercase hyphenated slug', () => {
    expect(toSlug('Mira Mesa')).toBe('mira-mesa');
    expect(toSlug('Barrio Logan')).toBe('barrio-logan');
  });

  it('strips non-alphanumeric characters except hyphens', () => {
    expect(toSlug("Mid-City:City Heights")).toBe('mid-city-city-heights');
  });

  it('handles empty string', () => {
    expect(toSlug('')).toBe('');
  });
});

describe('fromSlug', () => {
  it('converts slug back to title case', () => {
    expect(fromSlug('mira-mesa')).toBe('Mira Mesa');
    expect(fromSlug('barrio-logan')).toBe('Barrio Logan');
  });

  it('handles single word', () => {
    expect(fromSlug('downtown')).toBe('Downtown');
  });

  it('truncates slugs longer than 100 characters', () => {
    const longSlug = 'a'.repeat(150);
    const result = fromSlug(longSlug);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('strips non-alphanumeric non-hyphen characters', () => {
    expect(fromSlug('mira<script>mesa')).toBe('Mirascriptmesa');
  });

  it('handles empty slug', () => {
    expect(fromSlug('')).toBe('');
  });
});
