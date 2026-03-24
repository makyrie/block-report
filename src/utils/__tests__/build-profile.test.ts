import { describe, it, expect } from 'vitest';
import { buildNeighborhoodProfile } from '../build-profile';

const MOCK_METRICS = {
  totalRequests311: 100,
  resolvedCount: 80,
  resolutionRate: 0.8,
  avgDaysToResolve: 5,
  topIssues: [{ category: 'Pothole', count: 20 }],
  recentlyResolved: [],
  population: 10000,
  requestsPer1000Residents: 10,
  goodNews: [],
} as any;

describe('buildNeighborhoodProfile', () => {
  it('builds a profile with required fields', () => {
    const profile = buildNeighborhoodProfile({
      communityName: 'Mira Mesa',
      metrics: MOCK_METRICS,
    });

    expect(profile.communityName).toBe('Mira Mesa');
    expect(profile.metrics).toBe(MOCK_METRICS);
    expect(profile.anchor.community).toBe('Mira Mesa');
    expect(profile.demographics.topLanguages).toEqual([]);
    expect(profile.transit.transitScore).toBe(0);
    expect(profile.accessGap).toBeNull();
    expect(profile.trends).toBeUndefined();
  });

  it('uses provided anchor when given', () => {
    const anchor = {
      id: 'lib-1',
      name: 'Mira Mesa Library',
      type: 'library' as const,
      lat: 32.9,
      lng: -117.1,
      address: '8405 New Salem St',
      community: 'Mira Mesa',
    };
    const profile = buildNeighborhoodProfile({
      communityName: 'Mira Mesa',
      metrics: MOCK_METRICS,
      anchor,
    });

    expect(profile.anchor).toBe(anchor);
  });

  it('includes optional fields when provided', () => {
    const trends = {
      monthly: [],
      summary: {
        currentResolutionRate: 0.85,
        previousResolutionRate: 0.75,
        direction: 'improving' as const,
        volumeChange: -5,
        volumeDirection: 'stable' as const,
      },
    };
    const profile = buildNeighborhoodProfile({
      communityName: 'Mira Mesa',
      metrics: MOCK_METRICS,
      trends,
      topLanguages: [{ language: 'English', percentage: 60 }],
    });

    expect(profile.trends).toBe(trends);
    expect(profile.demographics.topLanguages).toEqual([{ language: 'English', percentage: 60 }]);
  });
});
