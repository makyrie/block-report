import { describe, it, expect } from 'vitest';
import {
  validateReportShape,
  sanitizeStringFields,
  sanitizeProfile,
  sanitizeBlockMetrics,
  sanitizeDemographics,
} from './claude';
import type { NeighborhoodProfile, BlockMetrics } from '../../src/types/index';

// --- validateReportShape ---

describe('validateReportShape', () => {
  const validReport = {
    neighborhoodName: 'Mira Mesa',
    language: 'en',
    summary: 'Welcome to Mira Mesa.',
    goodNews: ['Issue resolved'],
    topIssues: ['Potholes'],
    howToParticipate: ['Call 311'],
    contactInfo: { councilDistrict: '6', phone311: '619-236-5311', anchorLocation: 'Library' },
  };

  it('accepts a valid report shape', () => {
    expect(() => validateReportShape(validReport)).not.toThrow();
  });

  it('rejects null', () => {
    expect(() => validateReportShape(null)).toThrow('not an object');
  });

  it('rejects missing neighborhoodName', () => {
    expect(() => validateReportShape({ ...validReport, neighborhoodName: 123 })).toThrow('neighborhoodName');
  });

  it('rejects missing summary', () => {
    expect(() => validateReportShape({ ...validReport, summary: undefined })).toThrow('summary');
  });

  it('rejects non-array goodNews', () => {
    expect(() => validateReportShape({ ...validReport, goodNews: 'not array' })).toThrow('goodNews');
  });

  it('rejects missing contactInfo', () => {
    expect(() => validateReportShape({ ...validReport, contactInfo: null })).toThrow('contactInfo');
  });
});

// --- sanitizeStringFields ---

describe('sanitizeStringFields', () => {
  it('truncates long strings', () => {
    const result = sanitizeStringFields('a'.repeat(600), 500);
    expect(result).toHaveLength(500);
  });

  it('strips control characters', () => {
    const result = sanitizeStringFields('hello\x00world\x1f!');
    expect(result).toBe('helloworld!');
  });

  it('handles nested objects', () => {
    const result = sanitizeStringFields({ name: 'test\x00', items: ['a\x01b'] }) as Record<string, unknown>;
    expect(result.name).toBe('test');
    expect((result.items as string[])[0]).toBe('ab');
  });

  it('limits array length to 50', () => {
    const arr = Array.from({ length: 60 }, (_, i) => `item${i}`);
    const result = sanitizeStringFields(arr) as string[];
    expect(result).toHaveLength(50);
  });

  it('throws on deeply nested objects', () => {
    let obj: Record<string, unknown> = { val: 'leaf' };
    for (let i = 0; i < 15; i++) {
      obj = { nested: obj };
    }
    expect(() => sanitizeStringFields(obj)).toThrow('nesting too deep');
  });

  it('throws on objects with too many keys', () => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < 101; i++) {
      obj[`key${i}`] = 'val';
    }
    expect(() => sanitizeStringFields(obj)).toThrow('too many keys');
  });

  it('passes through numbers and booleans unchanged', () => {
    expect(sanitizeStringFields(42)).toBe(42);
    expect(sanitizeStringFields(true)).toBe(true);
    expect(sanitizeStringFields(null)).toBe(null);
  });
});

// --- sanitizeProfile ---

describe('sanitizeProfile', () => {
  const baseProfile: NeighborhoodProfile = {
    communityName: 'Mira Mesa',
    anchor: { id: '1', name: 'Library', type: 'library', lat: 32.9, lng: -117.1, address: '123 Main', community: 'Mira Mesa' },
    metrics: {
      totalRequests311: 100, resolvedCount: 80, resolutionRate: 0.8, avgDaysToResolve: 5,
      topIssues: [], recentlyResolved: [], population: 50000, requestsPer1000Residents: 2, goodNews: [],
    },
    transit: { nearbyStopCount: 5, nearestStopDistance: 0.3, stopCount: 10, agencyCount: 2, agencies: ['MTS'], transitScore: 60, cityAverage: 50, travelTimeToCityHall: null },
    demographics: { topLanguages: [{ language: 'English', percentage: 70 }] },
  };

  it('accepts a valid profile', () => {
    expect(() => sanitizeProfile(baseProfile)).not.toThrow();
  });

  it('rejects null profile', () => {
    expect(() => sanitizeProfile(null as unknown as NeighborhoodProfile)).toThrow('must be an object');
  });
});

// --- sanitizeBlockMetrics ---

describe('sanitizeBlockMetrics', () => {
  const validMetrics: BlockMetrics = {
    totalRequests: 50, openCount: 10, resolvedCount: 40, resolutionRate: 0.8,
    avgDaysToResolve: 5, topIssues: [], recentlyResolved: [], radiusMiles: 0.25,
  };

  it('accepts valid metrics', () => {
    expect(() => sanitizeBlockMetrics(validMetrics)).not.toThrow();
  });

  it('rejects non-object', () => {
    expect(() => sanitizeBlockMetrics(null as unknown as BlockMetrics)).toThrow('must be an object');
  });

  it('rejects missing totalRequests', () => {
    expect(() => sanitizeBlockMetrics({ ...validMetrics, totalRequests: 'bad' as unknown as number })).toThrow('must be numbers');
  });

  it('rejects negative totalRequests', () => {
    expect(() => sanitizeBlockMetrics({ ...validMetrics, totalRequests: -1 })).toThrow('out of bounds');
  });

  it('rejects Infinity radiusMiles', () => {
    expect(() => sanitizeBlockMetrics({ ...validMetrics, radiusMiles: Infinity })).toThrow('out of bounds');
  });

  it('rejects resolutionRate > 1', () => {
    expect(() => sanitizeBlockMetrics({ ...validMetrics, resolutionRate: 1.5 })).toThrow('out of bounds');
  });

  it('rejects extremely large totalRequests', () => {
    expect(() => sanitizeBlockMetrics({ ...validMetrics, totalRequests: 2_000_000 })).toThrow('out of bounds');
  });
});

// --- sanitizeDemographics ---

describe('sanitizeDemographics', () => {
  it('accepts valid demographics', () => {
    expect(() => sanitizeDemographics({ topLanguages: [{ language: 'English', percentage: 70 }] })).not.toThrow();
  });

  it('rejects null', () => {
    expect(() => sanitizeDemographics(null as unknown as { topLanguages: { language: string; percentage: number }[] })).toThrow('must be an object');
  });

  it('rejects non-array topLanguages', () => {
    expect(() => sanitizeDemographics({ topLanguages: 'bad' as unknown as { language: string; percentage: number }[] })).toThrow('must be an array');
  });
});
