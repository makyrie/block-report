import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getBlockMetrics } from '../../services/block.js';

export function registerBlockTools(server: McpServer) {
  server.tool(
    'get_block_metrics',
    'Get 311 service request metrics near a specific location in San Diego. Returns open/resolved counts, resolution rate, top issues, and recently resolved items within a given radius.',
    {
      lat: z.number().min(32.5).max(33.2).describe('Latitude of the location (must be within San Diego area, ~32.5-33.2)'),
      lng: z.number().min(-117.6).max(-116.8).describe('Longitude of the location (must be within San Diego area, ~-117.6 to -116.8)'),
      radius: z.number().min(0.1).max(2).default(0.25).describe('Search radius in miles (0.1-2, default 0.25)'),
    },
    async ({ lat, lng, radius }) => {
      try {
        const data = await getBlockMetrics(lat, lng, radius);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              location: { lat, lng },
              ...data,
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
