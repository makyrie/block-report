import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTransitScore } from '../../services/transit.js';
import { validateCommunityName } from '../../services/communities.js';

export function registerTransitTools(server: McpServer) {
  server.tool(
    'get_transit_score',
    'Get transit accessibility score (0-100) for a San Diego community. Includes stop count, transit agencies, estimated travel time to City Hall, and city-wide average for comparison.',
    {
      community_name: z.string().describe('Community plan area name (case-insensitive). Use list_communities to see valid names.'),
    },
    async ({ community_name }) => {
      try {
        const { valid, normalized, names } = await validateCommunityName(community_name);
        if (!valid) {
          return {
            content: [{
              type: 'text' as const,
              text: `No data found for community: "${community_name}". Use list_communities to see valid names. Did you mean one of: ${names.slice(0, 10).join(', ')}?`,
            }],
            isError: true,
          };
        }

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
              travelTimeToCityHall: result.travelTimeToCityHall ? `~${result.travelTimeToCityHall} min` : null,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
