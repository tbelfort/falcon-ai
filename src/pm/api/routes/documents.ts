import { Router } from 'express';
import { z } from 'zod';
import { createError } from '../../core/errors.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcastEvents, type WsBroadcaster } from '../broadcast.js';
import { sendError } from '../http-errors.js';
import { sendSuccess } from '../response.js';
import { isSafeRelativePath, LIMITS } from '../validation.js';

const createDocumentSchema = z.object({
  title: z.string().min(1).max(LIMITS.title),
  docType: z.enum(['context_pack', 'spec', 'ai_doc', 'other']),
  filePath: z.string().min(1).max(LIMITS.filePath),
  contentHash: z.string().min(1).max(LIMITS.contentHash).nullable().optional(),
  version: z.number().int().positive().optional(),
  createdBy: z.string().min(1).max(LIMITS.authorName).nullable().optional(),
});

export function createDocumentsRouter(
  services: PmServices,
  broadcaster: WsBroadcaster
) {
  const router = Router({ mergeParams: true });

  router.get('/', (req, res) => {
    const params = req.params as Record<string, string>;
    const result = services.documents.listByIssue(params.id);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.post('/', (req, res) => {
    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid document payload', parsed.error.flatten())
      );
    }

    if (!isSafeRelativePath(parsed.data.filePath)) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid document filePath')
      );
    }

    const params = req.params as Record<string, string>;
    const result = services.documents.createDocument({
      issueId: params.id,
      title: parsed.data.title,
      docType: parsed.data.docType,
      filePath: parsed.data.filePath,
      contentHash: parsed.data.contentHash ?? null,
      version: parsed.data.version ?? 1,
      createdBy: parsed.data.createdBy ?? null,
    });

    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  return router;
}
