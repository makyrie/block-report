export interface CommunityAnchor {
  id: string;
  name: string;
  type: 'library' | 'rec_center';
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  website?: string;
  community: string;
}

export interface NeighborhoodProfile {
  communityName: string;
  anchor: CommunityAnchor;
  metrics: {
    totalRequests311: number;
    resolvedCount: number;
    resolutionRate: number;
    avgDaysToResolve: number;
    topIssues: { category: string; count: number }[];
    recentlyResolved: { category: string; date: string }[];
    population: number;
    requestsPer1000Residents: number | null;
    goodNews: string[];
  };
  transit: {
    stopCount: number;
    agencyCount: number;
    agencies: string[];
    transitScore: number;
    cityAverage: number;
    travelTimeToCityHall: number | null;
  };
  demographics: {
    topLanguages: { language: string; percentage: number }[];
  };
  trends?: CommunityTrends;
  accessGap?: {
    accessGapScore: number;
    signals: {
      lowEngagement: number | null;
      lowTransit: number | null;
      highNonEnglish: number | null;
    };
    rank: number;
    totalCommunities: number;
  } | null;
}

export interface TrendDataPoint {
  period: string;          // "YYYY-MM" format
  totalRequests: number;
  resolvedCount: number;
  resolutionRate: number;  // 0-1
}

export interface TrendSummary {
  currentResolutionRate: number;
  previousResolutionRate: number;
  direction: 'improving' | 'declining' | 'stable';
  volumeChange: number;   // percentage change
  volumeDirection: 'improving' | 'declining' | 'stable';
}

export interface CommunityTrends {
  monthly: TrendDataPoint[];
  summary: TrendSummary;
}

export interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface BlockMetrics {
  totalRequests: number;
  openCount: number;
  resolvedCount: number;
  resolutionRate: number;
  avgDaysToResolve: number | null;
  topIssues: { category: string; count: number }[];
  recentlyResolved: { category: string; date: string }[];
  radiusMiles: number;
}

export interface CommunityReport {
  neighborhoodName: string;
  language: string;
  generatedAt: string;
  summary: string;
  goodNews: string[];
  topIssues: string[];
  howToParticipate: string[];
  contactInfo: {
    councilDistrict: string;
    phone311: string;
    anchorLocation: string;
  };
}

export interface CitywideCommunity {
  community: string;
  accessGapScore: number;
  signals: {
    lowEngagement: number | null;
    lowTransit: number | null;
    highNonEnglish: number | null;
  };
  topFactors: string[];
  rank: number;
  totalCommunities: number;
}

export interface StoredBlockReport {
  anchorName: string;
  anchorType: 'library' | 'rec_center';
  lat: number;
  lng: number;
  radiusMiles: number;
  communityName: string;
  language: string;
  generatedAt: string;
  report: CommunityReport;
}
