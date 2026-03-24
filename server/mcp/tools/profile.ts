import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getNeighborhoodProfile } from '../../services/profile.js';
import { withCommunityValidation } from './helpers.js';

export function registerProfileTools(server: McpServer) {
  server.tool(
    'get_neighborhood_profile',
    'Get a comprehensive civic profile for a San Diego community, combining 311 metrics, transit score, language demographics, access gap ranking, and nearby resources. This is the most complete view of a neighborhood.',
    {
      community_name: z.string().max(100).describe('Community plan area name (case-insensitive). Use list_communities to see valid names.'),
    },
    withCommunityValidation('get_neighborhood_profile', async (normalized) => {
      const profile = await getNeighborhoodProfile(normalized);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(profile) }],
      };
    }),
  );
}
