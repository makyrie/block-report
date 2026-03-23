import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeStringFields,
  sanitizeBlockMetrics,
  sanitizeDemographics,
  generateReport,
  generateBlockReport,
} from './claude';
import { validateReportShape } from '../utils/report-validation';
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

  it('accepts a valid report shape and returns without error', () => {
    expect(() => validateReportShape(validReport)).not.toThrow();
    // validateReportShape is an assertion function — if it doesn't throw, the input is valid
    validateReportShape(validReport);
    expect(validReport.neighborhoodName).toBe('Mira Mesa');
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

// --- sanitizeBlockMetrics ---

describe('sanitizeBlockMetrics', () => {
  const validMetrics: BlockMetrics = {
    totalRequests: 50, openCount: 10, resolvedCount: 40, resolutionRate: 0.8,
    avgDaysToResolve: 5, topIssues: [], recentlyResolved: [], radiusMiles: 0.25,
  };

  it('accepts valid metrics and returns sanitized copy', () => {
    const result = sanitizeBlockMetrics(validMetrics);
    expect(result.totalRequests).toBe(50);
    expect(result.radiusMiles).toBe(0.25);
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
  it('accepts valid demographics and returns sanitized copy', () => {
    const result = sanitizeDemographics({ topLanguages: [{ language: 'English', percentage: 70 }] });
    expect(result.topLanguages).toHaveLength(1);
    expect(result.topLanguages[0].language).toBe('English');
  });

  it('rejects null', () => {
    expect(() => sanitizeDemographics(null as unknown as { topLanguages: { language: string; percentage: number }[] })).toThrow('must be an object');
  });

  it('rejects non-array topLanguages', () => {
    expect(() => sanitizeDemographics({ topLanguages: 'bad' as unknown as { language: string; percentage: number }[] })).toThrow('must be an array');
  });
});

// --- generateReport / generateBlockReport with mocked Anthropic client ---

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn(),
      };
    },
  };
});

const validToolResponse = {
  neighborhoodName: 'Mira Mesa',
  language: 'en',
  summary: 'Welcome to Mira Mesa!',
  goodNews: ['Issue resolved'],
  topIssues: ['Potholes'],
  howToParticipate: ['Call 311'],
  contactInfo: { councilDistrict: '6', phone311: '619-236-5311', anchorLocation: 'Library' },
};

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

describe('generateReport', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.clearAllMocks();
  });

  it('returns a report with generatedAt from valid tool_use response', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'community_report', input: validToolResponse }],
    });
    vi.mocked(Anthropic).prototype = { messages: { create: mockCreate } } as unknown as InstanceType<typeof Anthropic>;

    // Force fresh client
    const mod = await import('./claude');
    // Access internal client reset — we'll test via the function directly
    const result = await mod.generateReport(baseProfile, 'en');
    expect(result.neighborhoodName).toBe('Mira Mesa');
    expect(result.generatedAt).toBeDefined();
    expect(typeof result.generatedAt).toBe('string');
  });

  it('throws when response has no tool_use block', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'no tool use' }],
    });
    vi.mocked(Anthropic).prototype = { messages: { create: mockCreate } } as unknown as InstanceType<typeof Anthropic>;

    await expect(generateReport(baseProfile, 'en')).rejects.toThrow('No tool use block');
  });

  it('throws when response shape is invalid', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'community_report', input: { bad: 'data' } }],
    });
    vi.mocked(Anthropic).prototype = { messages: { create: mockCreate } } as unknown as InstanceType<typeof Anthropic>;

    await expect(generateReport(baseProfile, 'en')).rejects.toThrow();
  });

  it('rejects empty communityName', async () => {
    const badProfile = { ...baseProfile, communityName: '' };
    await expect(generateReport(badProfile, 'en')).rejects.toThrow('non-empty string');
  });

  it('rejects communityName over 100 characters', async () => {
    const badProfile = { ...baseProfile, communityName: 'x'.repeat(101) };
    await expect(generateReport(badProfile, 'en')).rejects.toThrow('100 characters');
  });
});

describe('generateBlockReport', () => {
  const anchor = { id: '1', name: 'Mira Mesa Library', type: 'library' as const, lat: 32.9, lng: -117.1, address: '8405 New Salem St', community: 'Mira Mesa' };
  const blockMetrics: BlockMetrics = {
    totalRequests: 50, openCount: 10, resolvedCount: 40, resolutionRate: 0.8,
    avgDaysToResolve: 5, topIssues: [], recentlyResolved: [], radiusMiles: 0.25,
  };

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.clearAllMocks();
  });

  it('returns a report with generatedAt from valid tool_use response', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'community_report', input: validToolResponse }],
    });
    vi.mocked(Anthropic).prototype = { messages: { create: mockCreate } } as unknown as InstanceType<typeof Anthropic>;

    const result = await generateBlockReport(anchor, blockMetrics, 'en');
    expect(result.neighborhoodName).toBe('Mira Mesa');
    expect(result.generatedAt).toBeDefined();
  });

  it('throws when API returns no tool_use block', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'no tool use' }],
    });
    vi.mocked(Anthropic).prototype = { messages: { create: mockCreate } } as unknown as InstanceType<typeof Anthropic>;

    await expect(generateBlockReport(anchor, blockMetrics, 'en')).rejects.toThrow('No tool use block');
  });

  it('rejects invalid blockMetrics', async () => {
    const badMetrics = { ...blockMetrics, totalRequests: -1 };
    await expect(generateBlockReport(anchor, badMetrics, 'en')).rejects.toThrow('out of bounds');
  });
});
