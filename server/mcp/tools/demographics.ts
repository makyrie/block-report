import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDemographicsByCommunity } from '../../services/demographics.js';
import { withCommunityValidation } from './helpers.js';

export function registerDemographicsTools(server: McpServer) {
  server.tool(
    'get_demographics',
    'Get Census language demographics for a San Diego community. Returns languages spoken at home with percentages, sorted by prevalence. Data from ACS 5-year estimates.',
    {
      community_name: z.string().describe('Community plan area name (case-insensitive). Use list_communities to see valid names.'),
    },
    withCommunityValidation('get_demographics', async (normalized) => {
      const topLanguages = await getDemographicsByCommunity(normalized);
      if (topLanguages.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No demographic data available for "${normalized}". Census data may not cover this community.`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ community: normalized, topLanguages }, null, 2),
        }],
      };
    }),
  );
}
