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

export interface Permit {
  id: number;
  permit_number: string;
  permit_type: string | null;
  description: string | null;
  date_issued: string | null;
  status: string | null;
  street_address: string | null;
  community: string | null;
  /** Non-nullable: backend filters out permits without coordinates */
  lat: number;
  /** Non-nullable: backend filters out permits without coordinates */
  lng: number;
}

export interface Block311Report {
  id: string;
  lat: number;
  lng: number;
  category: string;
  categoryDetail: string | null;
  status: string;
  statusCategory: 'open' | 'resolved' | 'referred';
  dateRequested: string;
  dateClosed: string | null;
  address: string | null;
}


export interface BlockMetrics {
  totalReports: number;
  openCount: number;
  resolvedCount: number;
  referredCount: number;
  resolutionRate: number;
  avgDaysToResolve: number | null;
  topIssues: { category: string; count: number }[];
  recentlyResolved?: { category: string; date: string }[];
  radiusMiles: number;
  reports: Block311Report[];
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

export const DEFAULT_TRANSIT: NeighborhoodProfile['transit'] = {
  nearbyStopCount: 0,
  nearestStopDistance: 0,
  stopCount: 0,
  agencyCount: 0,
  agencies: [],
  transitScore: 0,
  cityAverage: 0,
  travelTimeToCityHall: null,
};

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
