import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './logger.js';
import locationsRouter from './routes/locations.js';
import metricsRouter from './routes/metrics.js';
import demographicsRouter from './routes/demographics.js';
import reportRouter from './routes/report.js';
import transitRouter from './routes/transit.js';
import gapAnalysisRouter from './routes/gap-analysis.js';
import blockRouter from './routes/block.js';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
}));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const communityReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many report generation requests, please try again later' },
});
const blockReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many block report generation requests, please try again later' },
});
const addressBlockReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many address block report generation requests, please try again later' },
});
const blockDataLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
// Use exact-path matching to prevent prefix overlap (generate vs generate-block)
app.post('/api/report/generate', communityReportLimiter);
app.post('/api/report/generate-block', blockReportLimiter);
app.post('/api/report/generate-address-block', addressBlockReportLimiter);
app.use('/api/block', blockDataLimiter);
app.use('/api', apiLimiter);

app.use(express.json({ limit: '50kb' }));

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
