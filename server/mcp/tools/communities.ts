import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCommunityNames } from '../../services/communities.js';

export function registerCommunityTools(server: McpServer) {
  server.tool(
    'list_communities',
    'List all valid San Diego community plan area names. Call this first to discover valid community names for other tools. Examples: MIRA MESA, BARRIO LOGAN, LA JOLLA, OCEAN BEACH.',
    {},
    async () => {
      try {
        const names = await getCommunityNames();
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ communities: names, count: names.length }, null, 2),
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
