import { Router } from 'express';
import type { DocumentsService } from '../../core/services/documents.service.js';
import { toApiError, getHttpStatus } from '../http-errors.js';
import { getBroadcaster } from '../websocket.js';

export function createDocumentsRouter(
  documentsService: DocumentsService
): Router {
  const router = Router();

  router.get('/issues/:issueId/documents', async (req, res) => {
    try {
      const result = await documentsService.getIssueDocuments(req.params.issueId);
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.post('/issues/:issueId/documents', async (req, res) => {
    try {
      const { title, docType, filePath, contentHash, createdBy, projectId } = req.body;
      if (!title || !docType || !filePath || !projectId) {
        throw new Error('VALIDATION_ERROR');
      }
      const result = await documentsService.createDocument({
        projectId,
        issueId: req.params.issueId,
        title,
        docType,
        filePath,
        contentHash,
        createdBy,
      });
      const broadcast = getBroadcaster();
      broadcast('document:' + result.data.id, 'document.created', result.data);
      broadcast('issue:' + req.params.issueId, 'document.created', result.data);
      res.status(201).json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  return router;
}