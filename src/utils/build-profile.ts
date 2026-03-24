import type { CommunityAnchor, CommunityTrends, NeighborhoodProfile } from '../types';

const DEFAULT_TRANSIT: NeighborhoodProfile['transit'] = {
  nearbyStopCount: 0,
  nearestStopDistance: 0,
  stopCount: 0,
  agencyCount: 0,
  agencies: [],
  transitScore: 0,
  cityAverage: 0,
  travelTimeToCityHall: null,
};

export function buildNeighborhoodProfile(opts: {
  communityName: string;
  anchor?: CommunityAnchor | null;
  metrics: NeighborhoodProfile['metrics'];
  transitScore?: NeighborhoodProfile['transit'] | null;
  topLanguages?: { language: string; percentage: number }[];
  trends?: CommunityTrends | null;
  accessGap?: NeighborhoodProfile['accessGap'];
}): NeighborhoodProfile {
  return {
    communityName: opts.communityName,
    anchor: opts.anchor ?? {
      id: '',
      name: opts.communityName,
      type: 'library' as const,
      lat: 0,
      lng: 0,
      address: '',
      community: opts.communityName,
    },
    metrics: opts.metrics,
    transit: opts.transitScore ?? DEFAULT_TRANSIT,
    demographics: { topLanguages: opts.topLanguages ?? [] },
    trends: opts.trends ?? undefined,
    accessGap: opts.accessGap ?? null,
  };
}
