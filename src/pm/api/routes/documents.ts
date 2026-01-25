import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DocumentService, CreateDocumentInput } from '../../core/services/document-service.js';
import { getHttpStatus } from '../http-errors.js';
import { broadcastIssueEvent } from '../websocket.js';

export function createDocumentRoutes(
  documentService: DocumentService,
  getIssueProjectId: (issueId: string) => Promise<string | null>
): Router {
  const router = Router({ mergeParams: true });

  // GET /api/issues/:issueId/documents
  router.get('/', async (req: Request<{ issueId: string }>, res: Response) => {
    try {
      const result = await documentService.list(req.params.issueId);
      if (result.ok) {
        res.json({ data: result.value });
      } else {
        res.status(getHttpStatus(result.error.code)).json({ error: result.error });
      }
    } catch {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  });

  // POST /api/issues/:issueId/documents
  router.post('/', async (req: Request<{ issueId: string }>, res: Response) => {
    try {
      const input: CreateDocumentInput = {
        title: req.body.title,
        docType: req.body.docType,
        filePath: req.body.filePath,
        contentHash: req.body.contentHash,
        createdBy: req.body.createdBy,
      };

      const result = await documentService.create(req.params.issueId, input);
      if (result.ok) {
        const projectId = await getIssueProjectId(req.params.issueId);
        if (projectId) {
          broadcastIssueEvent(projectId, req.params.issueId, 'document.created', result.value);
        }
        res.status(201).json({ data: result.value });
      } else {
        res.status(getHttpStatus(result.error.code)).json({ error: result.error });
      }
    } catch {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  });

  return router;
}
