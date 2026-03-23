import { describe, it, expect, vi, beforeEach } from 'vitest';

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
