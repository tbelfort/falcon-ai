import express from 'express';
import cors from 'cors';
import type { Application } from 'express';
import type { Server as HttpServer } from 'node:http';
import type { Repositories } from '../core/repos/interfaces.js';
import { ProjectService } from '../core/services/project-service.js';
import { IssueService } from '../core/services/issue-service.js';
import { LabelService } from '../core/services/label-service.js';
import { CommentService } from '../core/services/comment-service.js';
import { DocumentService } from '../core/services/document-service.js';
import { createProjectRoutes } from './routes/projects.js';
import { createIssueRoutes } from './routes/issues.js';
import { createLabelRoutes } from './routes/labels.js';
import { createCommentRoutes } from './routes/comments.js';
import { createDocumentRoutes } from './routes/documents.js';
import { setupWebSocket, closeWebSocket } from './websocket.js';

export interface CreateAppOptions {
  repos: Repositories;
}

export interface AppContext {
  app: Application;
  services: {
    projectService: ProjectService;
    issueService: IssueService;
    labelService: LabelService;
    commentService: CommentService;
    documentService: DocumentService;
  };
}

export function createApp(options: CreateAppOptions): AppContext {
  const { repos } = options;

  // Create services
  const projectService = new ProjectService(repos.projects);
  const issueService = new IssueService(
    repos.issues,
    repos.issueLabels,
    repos.labels,
    repos.projects,
    repos.presets
  );
  const labelService = new LabelService(repos.labels, repos.projects);
  const commentService = new CommentService(repos.comments, repos.issues);
  const documentService = new DocumentService(repos.documents, repos.issues);

  // Helper function to get project ID for an issue
  const getIssueProjectId = async (issueId: string): Promise<string | null> => {
    const issue = await repos.issues.findById(issueId);
    return issue?.projectId ?? null;
  };

  // Create Express app
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Mount routes
  app.use('/api/projects', createProjectRoutes(projectService));
  app.use('/api/projects/:projectId/labels', createLabelRoutes(labelService));
  app.use('/api/issues', createIssueRoutes(issueService));
  app.use('/api/issues/:issueId/comments', createCommentRoutes(commentService, getIssueProjectId));
  app.use('/api/issues/:issueId/documents', createDocumentRoutes(documentService, getIssueProjectId));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return {
    app,
    services: {
      projectService,
      issueService,
      labelService,
      commentService,
      documentService,
    },
  };
}

let httpServer: HttpServer | null = null;

export function startServer(app: Application, port: number): HttpServer {
  httpServer = app.listen(port, () => {
    console.log(`Falcon PM API server running on http://localhost:${port}`);
    console.log(`WebSocket available at ws://localhost:${port}/ws`);
  });

  setupWebSocket(httpServer);

  return httpServer;
}

export function stopServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    closeWebSocket();
    if (httpServer) {
      httpServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          httpServer = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}
