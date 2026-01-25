import express from 'express';
import cors from 'cors';
import type { PmRepos } from '../core/repos/index.js';
import { createPmServices } from '../core/services/index.js';
import type { WsBroadcaster } from './broadcast.js';
import { createCommentsRouter } from './routes/comments.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createIssuesRouter } from './routes/issues.js';
import { createLabelsRouter } from './routes/labels.js';
import { createProjectsRouter } from './routes/projects.js';

export interface ApiServerOptions {
  repos: PmRepos;
  broadcaster?: WsBroadcaster;
}

function resolveCorsOrigins(): string[] | boolean {
  const raw = process.env.FALCON_PM_CORS_ORIGINS;
  if (!raw) {
    return true;
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : true;
}

export function createApiServer(options: ApiServerOptions) {
  const app = express();
  const services = createPmServices(options.repos);
  const broadcaster = options.broadcaster ?? (() => undefined);

  app.use(cors({ origin: resolveCorsOrigins() }));
  app.use(express.json());

  app.use('/api/projects', createProjectsRouter(services, broadcaster));
  app.use('/api/issues', createIssuesRouter(services, broadcaster));
  app.use('/api/projects/:id/labels', createLabelsRouter(services, broadcaster));
  app.use('/api/issues/:id/comments', createCommentsRouter(services, broadcaster));
  app.use('/api/issues/:id/documents', createDocumentsRouter(services, broadcaster));

  return app;
}
