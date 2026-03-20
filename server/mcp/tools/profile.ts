import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getProcessedCommunityMetrics } from '../../services/metrics.js';
import { getTransitScore } from '../../services/transit.js';
import { getDemographicsByCommunity } from '../../services/demographics.js';
import { getAccessGapScore } from '../../services/gap-analysis.js';
import { getRecCenters, getLibraryCount } from '../../services/locations.js';
import { withCommunityValidation } from './helpers.js';
import { logger } from '../../logger.js';

export function registerProfileTools(server: McpServer) {
  server.tool(
    'get_neighborhood_profile',
    'Get a comprehensive civic profile for a San Diego community, combining 311 metrics, transit score, language demographics, access gap ranking, and nearby resources. This is the most complete view of a neighborhood.',
    {
      community_name: z.string().describe('Community plan area name (case-insensitive). Use list_communities to see valid names.'),
    },
    withCommunityValidation('get_neighborhood_profile', async (normalized) => {
      const TIMEOUT = 30_000;
      const warnOnError = <T>(name: string, p: Promise<T>, fallback: T): Promise<T> =>
        p.catch((err) => {
          logger.warn(`Profile sub-service "${name}" failed for ${normalized}`, { error: (err as Error).message });
          return fallback;
        });
      const timeout = <T>(p: Promise<T>, fallback: T) =>
        Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT))]);

      const [metrics, transit, demographics, accessGap, recCenters, libraryCount] = await Promise.all([
        timeout(warnOnError('metrics', getProcessedCommunityMetrics(normalized), null), null),
        timeout(warnOnError('transit', getTransitScore(normalized), null), null),
        timeout(warnOnError('demographics', getDemographicsByCommunity(normalized), []), []),
        timeout(warnOnError('accessGap', getAccessGapScore(normalized), null), null),
        timeout(warnOnError('recCenters', getRecCenters(normalized), []), []),
        timeout(warnOnError('libraryCount', getLibraryCount(), 0), 0),
      ]);

      const profile = {
        community: normalized,
        metrics: metrics ? {
          totalRequests311: metrics.totalRequests311,
          resolvedCount: metrics.resolvedCount,
          resolutionRate: Math.round(metrics.resolutionRate * 100) + '%',
          avgDaysToResolve: metrics.avgDaysToResolve,
          topIssues: metrics.topIssues.slice(0, 5),
          goodNews: metrics.goodNews,
        } : null,
        transit: transit ? {
          transitScore: transit.transitScore,
          cityAverage: transit.cityAverage,
          stopCount: transit.stopCount,
          agencies: transit.agencies,
          travelTimeToCityHall: transit.travelTimeToCityHall ? `~${transit.travelTimeToCityHall} min` : null,
        } : null,
        demographics: demographics.length > 0 ? demographics.slice(0, 5) : null,
        accessGap: accessGap ? {
          score: accessGap.accessGapScore,
          rank: `${accessGap.rank} of ${accessGap.totalCommunities}`,
          signals: accessGap.signals,
        } : null,
        resources: {
          recCenters: recCenters.slice(0, 5).map((r: { park_name: string | null; address: string | null; lat: number | null; lng: number | null }) => ({
            name: r.park_name,
            address: r.address,
            lat: r.lat,
            lng: r.lng,
          })),
          libraryCount: libraryCount,
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(profile, null, 2) }],
      };
    }),
  );
}
