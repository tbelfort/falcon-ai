import { Router, type Request } from 'express';
import type { ApiResponse, DocumentDto, DocumentType } from '../../contracts/http.js';
import { getUnixSeconds } from '../../core/services/helpers.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcast } from '../websocket.js';
import {
  optionalNullableString,
  optionalNumber,
  requireEnum,
  requireString,
} from '../validation.js';

const DOC_TYPES = ['context_pack', 'spec', 'ai_doc', 'other'] as const;

export function createDocumentsRouter(services: PmServices): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req: Request<{ issueId: string }>, res, next) => {
    try {
      const issueId = requireString(req.params.issueId, 'issueId');
      const documents = await services.documents.listByIssue(issueId);
      const response: ApiResponse<DocumentDto[]> = { data: documents };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req: Request<{ issueId: string }>, res, next) => {
    try {
      const issueId = requireString(req.params.issueId, 'issueId');
      const issue = await services.issues.get(issueId);
      const body = req.body ?? {};
      const document = await services.documents.create(issueId, {
        title: requireString(body.title, 'title'),
        docType: requireEnum<DocumentType>(body.docType, 'docType', DOC_TYPES),
        filePath: requireString(body.filePath, 'filePath'),
        contentHash: optionalNullableString(body.contentHash, 'contentHash'),
        version: optionalNumber(body.version, 'version'),
        createdBy: optionalNullableString(body.createdBy, 'createdBy'),
      });

      const eventPayload = {
        type: 'document.created' as const,
        at: getUnixSeconds(),
        projectId: issue.projectId,
        issueId,
        payload: document,
      };
      broadcast(`project:${issue.projectId}`, 'document.created', eventPayload);
      broadcast(`issue:${issueId}`, 'document.created', eventPayload);

      const response: ApiResponse<DocumentDto> = { data: document };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
