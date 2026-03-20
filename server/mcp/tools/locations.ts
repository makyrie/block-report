import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getLibraries, getRecCenters } from '../../services/locations.js';

export function registerLocationTools(server: McpServer) {
  server.tool(
    'list_libraries',
    'List San Diego public library locations with name, address, and coordinates. Optionally filter by community (filtering returns all libraries since library data lacks community field).',
    {
      community_name: z.string().optional().describe('Optional community name filter (not yet supported for libraries)'),
    },
    async () => {
      try {
        const data = await getLibraries();
        const curated = data.map((lib: { name: string | null; address: string | null; city: string | null; zip: string | null; phone: string | null; lat: number | null; lng: number | null }) => ({
          name: lib.name,
          address: lib.address,
          city: lib.city,
          zip: lib.zip,
          phone: lib.phone,
          lat: lib.lat,
          lng: lib.lng,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ libraries: curated, count: curated.length }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'list_rec_centers',
    'List San Diego recreation center locations. Optionally filter by community name (e.g., "MIRA MESA"). Returns name, address, park, and coordinates.',
    {
      community_name: z.string().optional().describe('Optional community name to filter rec centers (case-insensitive)'),
    },
    async ({ community_name }) => {
      try {
        const data = await getRecCenters(community_name);
        const curated = data.map((rc: { rec_bldg: string | null; park_name: string | null; address: string | null; zip: string | null; neighborhd: string | null; lat: number | null; lng: number | null }) => ({
          name: rc.rec_bldg,
          park: rc.park_name,
          address: rc.address,
          zip: rc.zip,
          neighborhood: rc.neighborhd,
          lat: rc.lat,
          lng: rc.lng,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ recCenters: curated, count: curated.length }, null, 2) }],
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
