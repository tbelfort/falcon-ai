import express from 'express';
import cors from 'cors';
import { setupWebSocket } from './websocket.js';
import { createProjectsRouter } from './routes/projects.js';
import { createIssuesRouter } from './routes/issues.js';
import { createLabelsRouter } from './routes/labels.js';
import { createCommentsRouter } from './routes/comments.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createInMemoryRepos } from '../core/testing/in-memory-repos.js';
import { ProjectsService } from '../core/services/projects.service.js';
import { IssuesService } from '../core/services/issues.service.js';
import { LabelsService } from '../core/services/labels.service.js';
import { CommentsService } from '../core/services/comments.service.js';
import { DocumentsService } from '../core/services/documents.service.js';

export function createServer(port?: number) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const repos = createInMemoryRepos();
  const projectsService = new ProjectsService(repos.projects);
  const issuesService = new IssuesService(repos.issues, repos.labels, repos.issueLabels);
  const labelsService = new LabelsService(repos.projects, repos.labels);
  const commentsService = new CommentsService(repos.issues, repos.comments);
  const documentsService = new DocumentsService(repos.projects, repos.issues, repos.documents);

  app.use('/api/projects', createProjectsRouter(projectsService));
  app.use('/api/issues', createIssuesRouter(issuesService));
  app.use('/api', createLabelsRouter(labelsService));
  app.use('/api', createCommentsRouter(commentsService));
  app.use('/api', createDocumentsRouter(documentsService));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const server = app.listen(port || 3002, port ? undefined : () => {
    console.log('API server listening on port 3002');
  });

  setupWebSocket(server);

  return app;
}