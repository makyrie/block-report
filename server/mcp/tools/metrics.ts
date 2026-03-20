import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getProcessedCommunityMetrics } from '../../services/metrics.js';
import { validateCommunityName } from '../../services/communities.js';

export function registerMetricsTools(server: McpServer) {
  server.tool(
    'get_311_metrics',
    'Get 311 service request metrics for a San Diego community, including total requests, resolution rate, top issues, and good news highlights. Examples: "MIRA MESA", "BARRIO LOGAN", "OCEAN BEACH".',
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

        const data = await getProcessedCommunityMetrics(normalized);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
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
