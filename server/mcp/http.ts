import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { prisma } from '../services/db.js';
import { registerAllTools } from './register-tools.js';

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!AUTH_TOKEN && process.env.MCP_AUTH_DISABLED !== 'true') {
  console.error('MCP HTTP transport: MCP_AUTH_TOKEN is required. Set MCP_AUTH_DISABLED=true to bypass (development only).');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Rate limiting — 60 requests per minute per IP
app.use('/mcp', rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
}));

// Bearer token authentication middleware
if (AUTH_TOKEN) {
  const tokenBuf = Buffer.from(AUTH_TOKEN);
  app.use('/mcp', (req, res, next) => {
    const auth = req.headers.authorization;
    const supplied = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    const suppliedBuf = Buffer.from(supplied);
    if (suppliedBuf.length !== tokenBuf.length || !crypto.timingSafeEqual(suppliedBuf, tokenBuf)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });
  console.error('MCP HTTP transport: bearer token authentication enabled');
} else {
  console.error('MCP HTTP transport: WARNING - running without authentication (MCP_AUTH_DISABLED=true)');
}

function createServer(): McpServer {
  const server = new McpServer({
    name: 'block-report',
    version: '1.0.0',
  });

  registerAllTools(server);

  return server;
}

// Map to store transports by session ID, with last-activity tracking
const MAX_SESSIONS = 1000;
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const transports = new Map<string, { transport: StreamableHTTPServerTransport; lastActivity: number }>();

// Periodic cleanup of stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of transports) {
    if (now - entry.lastActivity > SESSION_TTL) {
      entry.transport.close?.();
      transports.delete(sid);
    }
  }
}, 60 * 1000);

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const entry = transports.get(sessionId)!;
    entry.lastActivity = Date.now();
    await entry.transport.handleRequest(req, res, req.body);
    return;
  }

  // Reject new sessions when at capacity
  if (transports.size >= MAX_SESSIONS) {
    res.status(503).json({ error: 'Too many active sessions. Try again later.' });
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
    transports.set(transport.sessionId, { transport, lastActivity: Date.now() });
  }

  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Missing or invalid session ID. Send a POST to /mcp first.' });
    return;
  }
  const entry = transports.get(sessionId)!;
  entry.lastActivity = Date.now();
  await entry.transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Missing or invalid session ID' });
    return;
  }
  const entry = transports.get(sessionId)!;
  await entry.transport.handleRequest(req, res);
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
