import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getProcessedCommunityMetrics } from '../../services/metrics.js';
import { withCommunityValidation } from './helpers.js';

export function registerMetricsTools(server: McpServer) {
  server.tool(
    'get_311_metrics',
    'Get 311 service request metrics for a San Diego community, including total requests, resolution rate, top issues, and good news highlights. Examples: "MIRA MESA", "BARRIO LOGAN", "OCEAN BEACH".',
    {
      community_name: z.string().describe('Community plan area name (case-insensitive). Use list_communities to see valid names.'),
    },
    withCommunityValidation('get_311_metrics', async (normalized) => {
      const data = await getProcessedCommunityMetrics(normalized);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }),
  );
}
