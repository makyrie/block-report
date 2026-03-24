import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { prisma } from '../services/db.js';
import { registerAllTools } from './register-tools.js';

const server = new McpServer({
  name: 'block-report',
  version: '1.0.0',
});

// Register all tools
registerAllTools(server);

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
