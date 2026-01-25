import { Router } from 'express';
import type { DocumentType } from '../../core/types.js';
import type { ApiContext } from '../context.js';
import { asyncHandler } from '../async-handler.js';
import {
  optionalNumber,
  optionalString,
  requireEnum,
  requireSafePath,
  requireString,
  NUMBER_LIMITS,
  STRING_LIMITS,
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
      const title = requireString(body.title, 'title', {
        maxLength: STRING_LIMITS.documentTitle,
      });
      const docType = requireEnum(body.docType, 'docType', DOCUMENT_TYPES);
      const filePath = requireSafePath(body.filePath, 'filePath', {
        maxLength: STRING_LIMITS.documentFilePath,
      });
      const contentHash = optionalString(body.contentHash, 'contentHash', {
        maxLength: STRING_LIMITS.documentContentHash,
      });
      const version = optionalNumber(body.version, 'version', {
        min: 1,
        max: NUMBER_LIMITS.documentVersionMax,
        integer: true,
      });
      const createdBy = optionalString(body.createdBy, 'createdBy', {
        maxLength: STRING_LIMITS.documentCreatedBy,
      });

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
