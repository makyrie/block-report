import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTopUnderserved } from '../../services/gap-analysis.js';

export function registerGapAnalysisTools(server: McpServer) {
  server.tool(
    'get_access_gap_ranking',
    'Get a ranked list of San Diego neighborhoods by access gap score (0-100). Higher scores indicate greater underservice based on 311 engagement, transit access, and non-English speaking population.',
    {
      limit: z.number().min(1).max(50).default(10).describe('Number of communities to return (1-50, default 10)'),
    },
    async ({ limit }) => {
      try {
        const ranking = await getTopUnderserved(limit);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ranking,
              methodology: 'Composite score (0-100) from three signals: low 311 engagement (35%), low transit access (30%), high non-English speaking population (35%). Higher score = greater access gap.',
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
