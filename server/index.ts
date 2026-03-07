import express from 'express';
import cors from 'cors';
import locationsRouter from './routes/locations.js';
import metricsRouter from './routes/metrics.js';
import demographicsRouter from './routes/demographics.js';
import briefRouter from './routes/brief.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/locations', locationsRouter);
app.use('/api/311', metricsRouter);
app.use('/api/demographics', demographicsRouter);
app.use('/api/brief', briefRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
