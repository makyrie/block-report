import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './logger.js';
import { isVercel } from './env.js';
import { prisma } from './services/db.js';
import { purgeStaleCache } from './services/report-cache.js';
import locationsRouter from './routes/locations.js';
import metricsRouter from './routes/metrics.js';
import demographicsRouter from './routes/demographics.js';
import reportRouter from './routes/report.js';
import transitRouter from './routes/transit.js';
import gapAnalysisRouter from './routes/gap-analysis.js';
import blockRouter from './routes/block.js';

const app = express();

if (isVercel) {
  app.set('trust proxy', 1);
}

app.use(helmet());

const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()).filter(Boolean) || [];
if (process.env.VERCEL_URL) {
  const vercelUrl = process.env.VERCEL_URL;
  // Only trust VERCEL_URL if it's on the .vercel.app domain (prevents fork preview abuse)
  if (vercelUrl.endsWith('.vercel.app')) {
    allowedOrigins.push(`https://${vercelUrl}`);
  }
}
if (allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
}

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
}));

app.use(express.json({ limit: '50kb' }));

// Liveness probe — no DB, instant response for load balancers
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Readiness probe — deep DB check with timeout for deploy verification
app.get('/api/health/ready', async (_req, res) => {
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB health check timed out')), 5000),
    );
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

// WARNING: In-memory rate limiting resets on every cold start in serverless (Vercel).
// This provides best-effort protection only — a determined caller can bypass it by
// waiting for new instances. For production, use Vercel WAF or Upstash Redis-backed
// rate limiting to protect against Claude API cost exposure.
if (isVercel) {
  logger.warn('Rate limiting is in-memory only — ineffective across serverless instances. Configure Vercel WAF or Upstash for production.');
}
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many report generation requests, please try again later' },
});
app.use('/api/report', reportLimiter);
app.use('/api', apiLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

app.use('/api/locations', locationsRouter);
app.use('/api/311', metricsRouter);
app.use('/api/demographics', demographicsRouter);
app.use('/api/report', reportRouter);
app.use('/api/transit', transitRouter);
app.use('/api/access-gap', gapAnalysisRouter);
app.use('/api/block', blockRouter);

// Purge stale cache rows on startup (fire-and-forget)
purgeStaleCache().catch(() => {});

export default app;
