import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { PmRepos } from '../core/repos/index.js';
import { createPmServices } from '../core/services/index.js';
import type { WsBroadcaster } from './broadcast.js';
import { createAgentIssuesRouter } from './routes/agent/issues.js';
import { createCommentsRouter } from './routes/comments.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createGitHubWebhookRouter } from './routes/github-webhook.js';
import { createIssuesRouter } from './routes/issues.js';
import { createLabelsRouter } from './routes/labels.js';
import { createProjectsRouter } from './routes/projects.js';

export interface ApiServerOptions {
  repos: PmRepos;
  broadcaster?: WsBroadcaster;
}

const DEFAULT_LOCALHOST_ORIGINS = [
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function resolveCorsOrigins(): string[] {
  const raw = process.env.FALCON_PM_CORS_ORIGINS;
  if (!raw) {
    return DEFAULT_LOCALHOST_ORIGINS;
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : DEFAULT_LOCALHOST_ORIGINS;
}

// Rate limiter for general API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter rate limiter for webhook endpoint
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute (1 per second average)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests.' },
});

export function createApiServer(options: ApiServerOptions) {
  const app = express();
  const services = createPmServices(options.repos);
  const broadcaster = options.broadcaster ?? (() => undefined);

  app.use(cors({ origin: resolveCorsOrigins() }));
  app.use(express.json({ limit: '100kb' }));

  // Apply rate limiting to API routes
  app.use('/api', apiLimiter);

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'");
    next();
  });

  app.use('/api/projects', createProjectsRouter(services, broadcaster));
  app.use('/api/issues', createIssuesRouter(services, broadcaster));
  app.use('/api/projects/:id/labels', createLabelsRouter(services, broadcaster));
  app.use('/api/issues/:id/comments', createCommentsRouter(services, broadcaster));
  app.use('/api/issues/:id/documents', createDocumentsRouter(services, broadcaster));
  app.use('/api/agent/issues', createAgentIssuesRouter(services));
  app.use('/api/github/webhook', webhookLimiter, createGitHubWebhookRouter({ repos: options.repos }));

  return app;
}
