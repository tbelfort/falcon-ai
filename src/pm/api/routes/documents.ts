import { Router } from 'express';
import type { DocumentType } from '../../core/types.js';
import type { ApiContext } from '../context.js';
import { asyncHandler } from '../async-handler.js';
import {
  optionalNumber,
  optionalString,
  requireEnum,
  requireString,
} from '../validation.js';

const DOCUMENT_TYPES: DocumentType[] = [
  'context_pack',
  'spec',
  'ai_doc',
  'other',
];

export function createDocumentsRouter(context: ApiContext): Router {
  const router = Router();

  router.get(
    '/:id/documents',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const documents = context.services.documents.listDocuments(issueId);
      res.json({ data: documents });
    })
  );

  router.post(
    '/:id/documents',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const title = requireString(body.title, 'title');
      const docType = requireEnum(body.docType, 'docType', DOCUMENT_TYPES);
      const filePath = requireString(body.filePath, 'filePath');
      const contentHash = optionalString(body.contentHash, 'contentHash');
      const version = optionalNumber(body.version, 'version');
      const createdBy = optionalString(body.createdBy, 'createdBy');

      const issue = context.services.issues.getIssue(issueId);
      const document = context.services.documents.createDocument(issueId, {
        title,
        docType,
        filePath,
        contentHash,
        version,
        createdBy,
      });

      const event = {
        type: 'document.created' as const,
        at: context.now(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: document,
      };

      context.broadcast(`project:${issue.projectId}`, 'document.created', event);
      context.broadcast(`issue:${issue.id}`, 'document.created', event);
      res.json({ data: document });
    })
  );

  return router;
}
