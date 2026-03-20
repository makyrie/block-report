import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDemographicsByCommunity } from '../../services/demographics.js';
import { validateCommunityName } from '../../services/communities.js';

export function registerDemographicsTools(server: McpServer) {
  server.tool(
    'get_demographics',
    'Get Census language demographics for a San Diego community. Returns languages spoken at home with percentages, sorted by prevalence. Data from ACS 5-year estimates.',
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
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
