import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeStringFields, CONTROL_CHAR_RE } from './claude.js';

// Mock Anthropic SDK before importing
vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn(() => ({ messages: { create } })),
    __mockCreate: create,
  };
});

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Set env before import
process.env.ANTHROPIC_API_KEY = 'test-key';

import type { NeighborhoodProfile } from '../../types/index.js';

const validProfile: NeighborhoodProfile = {
  communityName: 'Mira Mesa',
  anchor: { id: '1', name: 'Mira Mesa Library', type: 'library', lat: 32.9, lng: -117.1, address: '8405 New Salem St', community: 'Mira Mesa' },
  metrics: {
    totalRequests311: 100,
    resolvedCount: 80,
    resolutionRate: 0.8,
    avgDaysToResolve: 5,
    topIssues: [{ category: 'Potholes', count: 30 }],
    recentlyResolved: [],
    population: 80000,
    requestsPer1000Residents: 1.25,
    goodNews: ['80% of issues resolved'],
  },
  transit: { nearbyStopCount: 5, nearestStopDistance: 0.2, stopCount: 10, agencyCount: 2, agencies: [], transitScore: 60, cityAverage: 50, travelTimeToCityHall: null },
  demographics: { topLanguages: [{ language: 'English', percentage: 60 }] },
  accessGap: null,
};

const toolUseResponse = {
  content: [{
    type: 'tool_use',
    name: 'community_report',
    input: {
      neighborhoodName: 'Mira Mesa',
      language: 'en',
      summary: 'Welcome to Mira Mesa!',
      goodNews: ['Good news'],
      topIssues: ['Issue 1'],
      howToParticipate: ['Action 1'],
      contactInfo: { councilDistrict: '6', phone311: '619-236-5311', anchorLocation: 'Mira Mesa Library' },
    },
  }],
};

describe('sanitizeStringFields', () => {
  it('truncates strings to maxLen', () => {
    const result = sanitizeStringFields('a'.repeat(600));
    expect(result).toBe('a'.repeat(500));
  });

  it('strips control characters from strings', () => {
    const result = sanitizeStringFields('hello\x00world\x1f!');
    expect(result).toBe('helloworld!');
  });

  it('caps arrays to maxArrayItems', () => {
    const arr = Array.from({ length: 100 }, (_, i) => `item-${i}`);
    const result = sanitizeStringFields(arr) as string[];
    expect(result).toHaveLength(50); // default
  });

  it('respects custom maxArrayItems', () => {
    const arr = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const result = sanitizeStringFields(arr, undefined, undefined, { maxArrayItems: 5 }) as string[];
    expect(result).toHaveLength(5);
  });

  it('respects custom maxStringLen', () => {
    const result = sanitizeStringFields('a'.repeat(3000), undefined, undefined, { maxStringLen: 2000 });
    expect(result).toBe('a'.repeat(2000));
  });

  it('throws on deeply nested objects beyond maxDepth', () => {
    let obj: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 15; i++) {
      obj = { nested: obj };
    }
    expect(() => sanitizeStringFields(obj)).toThrow(/too deep/);
  });

  it('does not throw on objects within maxDepth', () => {
    let obj: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 8; i++) {
      obj = { nested: obj };
    }
    expect(() => sanitizeStringFields(obj)).not.toThrow();
  });

  it('throws on objects with too many keys', () => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < 101; i++) {
      obj[`key${i}`] = 'value';
    }
    expect(() => sanitizeStringFields(obj)).toThrow(/too many keys/);
  });

  it('passes through numbers and booleans unchanged', () => {
    expect(sanitizeStringFields(42)).toBe(42);
    expect(sanitizeStringFields(true)).toBe(true);
    expect(sanitizeStringFields(null)).toBe(null);
  });

  it('recursively sanitizes nested objects', () => {
    const input = {
      name: 'test\x00name',
      details: {
        description: 'x'.repeat(600),
        items: ['a', 'b'],
      },
    };
    const result = sanitizeStringFields(input) as Record<string, unknown>;
    expect((result as { name: string }).name).toBe('testname');
    const details = result.details as { description: string; items: string[] };
    expect(details.description).toBe('x'.repeat(500));
    expect(details.items).toEqual(['a', 'b']);
  });
});

describe('CONTROL_CHAR_RE', () => {
  it('matches null byte', () => {
    expect('hello\x00world'.replace(CONTROL_CHAR_RE, '')).toBe('helloworld');
  });

  it('matches DEL character', () => {
    expect('hello\x7fworld'.replace(CONTROL_CHAR_RE, '')).toBe('helloworld');
  });

  it('does not match printable characters', () => {
    const clean = 'Hello, World! 123';
    expect(clean.replace(CONTROL_CHAR_RE, '')).toBe(clean);
  });
});

describe('generateReport', () => {
  let generateReport: typeof import('./claude.js').generateReport;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const sdk = await import('@anthropic-ai/sdk');
    mockCreate = (sdk as unknown as { __mockCreate: ReturnType<typeof vi.fn> }).__mockCreate;
    mockCreate.mockReset();
    const mod = await import('./claude.js');
    generateReport = mod.generateReport;
  });

  it('returns a structured report from Claude tool_use response', async () => {
    mockCreate.mockResolvedValue(toolUseResponse);
    const report = await generateReport(validProfile, 'en');
    expect(report.neighborhoodName).toBe('Mira Mesa');
    expect(report.generatedAt).toBeDefined();
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('throws on empty communityName', async () => {
    const bad = { ...validProfile, communityName: '' };
    await expect(generateReport(bad, 'en')).rejects.toThrow('communityName must be a non-empty string');
  });

  it('throws on oversized communityName', async () => {
    const bad = { ...validProfile, communityName: 'x'.repeat(101) };
    await expect(generateReport(bad, 'en')).rejects.toThrow('communityName must be 100 characters or fewer');
  });

  it('throws when Claude returns no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hi' }] });
    await expect(generateReport(validProfile, 'en')).rejects.toThrow('No tool use block');
  });
});
