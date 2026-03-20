import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { prisma } from '../services/db.js';
import { registerCommunityTools } from './tools/communities.js';
import { registerMetricsTools } from './tools/metrics.js';
import { registerProfileTools } from './tools/profile.js';
import { registerGapAnalysisTools } from './tools/gap-analysis.js';
import { registerLocationTools } from './tools/locations.js';
import { registerDemographicsTools } from './tools/demographics.js';
import { registerTransitTools } from './tools/transit.js';
import { registerBlockTools } from './tools/block.js';

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

const app = express();
app.use(express.json());

// Bearer token authentication middleware
if (AUTH_TOKEN) {
  app.use('/mcp', (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${AUTH_TOKEN}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });
  console.error('MCP HTTP transport: bearer token authentication enabled');
} else {
  console.error('MCP HTTP transport: WARNING - no MCP_AUTH_TOKEN set, running without authentication');
}

function createServer(): McpServer {
  const server = new McpServer({
    name: 'block-report',
    version: '1.0.0',
  });

  registerCommunityTools(server);
  registerMetricsTools(server);
  registerProfileTools(server);
  registerGapAnalysisTools(server);
  registerLocationTools(server);
  registerDemographicsTools(server);
  registerTransitTools(server);
  registerBlockTools(server);

  return server;
}

// Map to store transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New session
  const transport = new StreamableHTTPServerTransport('/mcp', res);
  const server = createServer();

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) transports.delete(sid);
  };

  await server.connect(transport);

  if (transport.sessionId) {
    transports.set(transport.sessionId, transport);
  }

  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Missing or invalid session ID. Send a POST to /mcp first.' });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Missing or invalid session ID' });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
  transports.delete(sessionId);
});

// Graceful shutdown
async function shutdown() {
  console.error('MCP HTTP server shutting down...');
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const PORT = parseInt(process.env.MCP_HTTP_PORT || '3002', 10);
app.listen(PORT, () => {
  console.error(`Block Report MCP HTTP server running on port ${PORT}`);
});
