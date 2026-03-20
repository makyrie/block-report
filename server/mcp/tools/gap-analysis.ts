import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTopUnderserved } from '../../services/gap-analysis.js';
import { withErrorHandling } from './helpers.js';

export function registerGapAnalysisTools(server: McpServer) {
  server.tool(
    'get_access_gap_ranking',
    'Get a ranked list of San Diego neighborhoods by access gap score (0-100). Higher scores indicate greater underservice based on 311 engagement, transit access, and non-English speaking population.',
    {
      limit: z.number().min(1).max(50).default(10).describe('Number of communities to return (1-50, default 10)'),
    },
    withErrorHandling('get_access_gap_ranking', async ({ limit }) => {
      const ranking = await getTopUnderserved(limit as number);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ranking,
            methodology: 'Composite score (0-100) from three signals: low 311 engagement (35%), low transit access (30%), high non-English speaking population (35%). Higher score = greater access gap.',
          }, null, 2),
        }],
      };
    }),
  );
}
