import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './logger.js';
import { prisma } from './services/db.js';
import locationsRouter from './routes/locations.js';
import metricsRouter from './routes/metrics.js';
import demographicsRouter from './routes/demographics.js';
import reportRouter from './routes/report.js';
import transitRouter from './routes/transit.js';
import gapAnalysisRouter from './routes/gap-analysis.js';
import blockRouter from './routes/block.js';

const app = express();

app.use(helmet());

const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()).filter(Boolean) || [];
if (process.env.VERCEL_URL) {
  allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
}
if (allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
}

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
}));

app.use(express.json());

// Health check — registered before rate limiter so monitoring doesn't consume API budget
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

const isVercel = !!process.env.VERCEL;
if (isVercel) {
  logger.warn('In-memory rate limiting is ineffective on serverless — counters reset per cold start');
}
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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

export default app;
