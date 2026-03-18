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
    nearbyStopCount: number;
    nearestStopDistance: number;
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

export interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface NearbyOpenIssue {
  serviceRequestId: string;
  serviceName: string;
  serviceNameDetail?: string;
  streetAddress?: string;
  dateRequested: string;
  daysOpen: number;
  distanceMiles: number;
}

export interface NearbyResource {
  name: string;
  type: 'library' | 'rec_center';
  address: string;
  distanceMiles: number;
  phone?: string;
  website?: string;
}

export interface BlockMetrics {
  totalRequests: number;
  openCount: number;
  resolvedCount: number;
  resolutionRate: number;
  avgDaysToResolve: number | null;
  topIssues: { category: string; count: number }[];
  radiusMiles: number;
  nearbyOpenIssues?: NearbyOpenIssue[];
  nearbyResources?: NearbyResource[];
  nearestAddress?: string | null;
  communityName?: string | null;
  truncated?: boolean;
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
