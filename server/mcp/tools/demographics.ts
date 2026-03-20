import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDemographicsByCommunity, getDemographicsByTract } from '../../services/demographics.js';
import { withCommunityValidation, withErrorHandling } from './helpers.js';

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

  server.tool(
    'get_demographics_by_tract',
    'Get Census language demographics for a specific census tract in San Diego County. Returns languages spoken at home with percentages.',
    {
      tract: z.string().regex(/^\d{6}$/, 'Census tract must be a 6-digit string').describe('Census tract ID (6 digits, e.g. "008301")'),
    },
    withErrorHandling('get_demographics_by_tract', async ({ tract }) => {
      const topLanguages = await getDemographicsByTract(tract);
      if (topLanguages.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No demographic data found for tract "${tract}".`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ tract, topLanguages }, null, 2),
        }],
      };
    }),
  );
}
