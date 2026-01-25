import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import type { Repositories } from '../core/repos/index.js';
import { createServices } from '../core/services/index.js';
import { ServiceError } from '../core/services/errors.js';
import { toErrorResponse } from './http-errors.js';
import type { ApiContext, BroadcastFn } from './context.js';
import { broadcast as defaultBroadcast } from './websocket.js';
import { createProjectsRouter } from './routes/projects.js';
import { createIssuesRouter } from './routes/issues.js';
import { createLabelsRouter } from './routes/labels.js';
import { createCommentsRouter } from './routes/comments.js';
import { createDocumentsRouter } from './routes/documents.js';

export interface ApiAppOptions {
  repos: Repositories;
  now?: () => number;
  broadcaster?: BroadcastFn;
}

export function createApiApp(options: ApiAppOptions): Express {
  const app = express();
  const now = options.now ?? (() => Date.now());
  const services = createServices(options.repos, now);
  const broadcast = options.broadcaster ?? defaultBroadcast;

  const context: ApiContext = {
    services,
    broadcast,
    now,
  };

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.use('/projects', createProjectsRouter(context));
  api.use('/issues', createIssuesRouter(context));
  api.use('/projects', createLabelsRouter(context));
  api.use('/issues', createCommentsRouter(context));
  api.use('/issues', createDocumentsRouter(context));
  app.use('/api', api);

  app.use((req, res) => {
    void req;
    const { status, body } = toErrorResponse(
      new ServiceError('NOT_FOUND', 'Route not found')
    );
    res.status(status).json(body);
  });

  app.use((
    error: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    void req;
    void next;
    const { status, body } = toErrorResponse(error);
    res.status(status).json(body);
  });

  return app;
}
