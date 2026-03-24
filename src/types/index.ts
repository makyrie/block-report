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

export interface TransitStop {
  id: string;
  name: string;
  lat: number;
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
  recentlyResolved: { category: string; date: string }[];
  radiusMiles: number;
  reports: Block311Report[];
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
