import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import { analyzeRouter } from './routes/analyze';
import { mealsRouter } from './routes/meals';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(analyzeRouter);
  app.use(mealsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  app.use(errorHandler);

  return app;
}
