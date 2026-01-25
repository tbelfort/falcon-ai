import express from 'express';
import cors from 'cors';

import type { Services } from '../core/services/index.js';
import type { BroadcastFn } from './websocket.js';
import { createProjectsRouter } from './routes/projects.js';
import { createIssuesRouter } from './routes/issues.js';
import { createLabelsRouter } from './routes/labels.js';
import { createCommentsRouter } from './routes/comments.js';
import { createDocumentsRouter } from './routes/documents.js';

export interface ApiAppOptions {
  services: Services;
  broadcast: BroadcastFn;
}

export function createApiApp({ services, broadcast }: ApiAppOptions): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/projects', createProjectsRouter({ services, broadcast }));
  app.use('/api/issues', createIssuesRouter({ services, broadcast }));
  app.use('/api', createLabelsRouter({ services, broadcast }));
  app.use('/api', createCommentsRouter({ services, broadcast }));
  app.use('/api', createDocumentsRouter({ services, broadcast }));

  return app;
}
