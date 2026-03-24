import type { CommunityReport, NeighborhoodProfile } from '../../../src/types/index.js';

export interface PdfOptions {
  report: CommunityReport;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
  neighborhoodSlug: string;
  baseUrl: string;
}
