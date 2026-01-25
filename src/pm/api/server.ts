import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { createInMemoryRepos } from '../core/testing/in-memory-repos.js';
import type { PmRepos } from '../core/repos/index.js';
import { createPmServices } from '../core/services/index.js';
import { toApiErrorResponse } from './http-errors.js';
import { createProjectsRouter } from './routes/projects.js';
import { createIssuesRouter } from './routes/issues.js';
import { createLabelsRouter } from './routes/labels.js';
import { createCommentsRouter } from './routes/comments.js';
import { createDocumentsRouter } from './routes/documents.js';
import { setupWebSocket } from './websocket.js';

export interface ApiServerOptions {
  repos?: PmRepos;
}

export function createPmApiApp(options: ApiServerOptions = {}): express.Express {
  const repos = options.repos ?? createInMemoryRepos();
  const services = createPmServices(repos);
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/projects', createProjectsRouter(services));
  app.use('/api/issues', createIssuesRouter(services));
  app.use('/api/projects/:projectId/labels', createLabelsRouter(services));
  app.use('/api/issues/:issueId/comments', createCommentsRouter(services));
  app.use('/api/issues/:issueId/documents', createDocumentsRouter(services));

  app.use((_req, res) => {
    void _req;
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _req;
    void _next;
    const { status, body } = toApiErrorResponse(err);
    res.status(status).json(body);
  });

  return app;
}

export function createPmApiServer(options: ApiServerOptions = {}): {
  app: express.Express;
  server: http.Server;
} {
  const app = createPmApiApp(options);
  const server = http.createServer(app);
  setupWebSocket(server);
  return { app, server };
}
