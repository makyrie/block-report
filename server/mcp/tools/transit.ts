import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTransitScore, formatTravelTime } from '../../services/transit.js';
import { withCommunityValidation } from './helpers.js';

export function registerTransitTools(server: McpServer) {
  server.tool(
    'get_transit_score',
    'Get transit accessibility score (0-100) for a San Diego community. Includes stop count, transit agencies, estimated travel time to City Hall, and city-wide average for comparison.',
    {
      community_name: z.string().max(100).describe('Community plan area name (case-insensitive). Use list_communities to see valid names.'),
    },
    withCommunityValidation('get_transit_score', async (normalized) => {
      const result = await getTransitScore(normalized);
      if (!result) {
        return {
          content: [{
            type: 'text' as const,
            text: `No transit data available for "${normalized}".`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            community: normalized,
            transitScore: result.transitScore,
            cityAverage: result.cityAverage,
            stopCount: result.stopCount,
            agencyCount: result.agencyCount,
            agencies: result.agencies,
            travelTimeToCityHall: formatTravelTime(result.travelTimeToCityHall),
          }),
        }],
      };
    }),
  );
}
