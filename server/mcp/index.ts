import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { prisma } from '../services/db.js';
import { registerCommunityTools } from './tools/communities.js';
import { registerMetricsTools } from './tools/metrics.js';
import { registerProfileTools } from './tools/profile.js';
import { registerGapAnalysisTools } from './tools/gap-analysis.js';
import { registerLocationTools } from './tools/locations.js';
import { registerDemographicsTools } from './tools/demographics.js';
import { registerTransitTools } from './tools/transit.js';
import { registerBlockTools } from './tools/block.js';

const server = new McpServer({
  name: 'block-report',
  version: '1.0.0',
});

// Register all tools
registerCommunityTools(server);
registerMetricsTools(server);
registerProfileTools(server);
registerGapAnalysisTools(server);
registerLocationTools(server);
registerDemographicsTools(server);
registerTransitTools(server);
registerBlockTools(server);

// Graceful shutdown
async function shutdown() {
  console.error('MCP server shutting down...');
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Block Report MCP server running on stdio');
