import { Router } from 'express';
import { z } from 'zod';

import type { Services } from '../../core/services/index.js';
import type { BroadcastFn } from '../websocket.js';
import { sendResult, sendValidationError } from '../response.js';
import { buildEventPayload } from '../events.js';

const DOCUMENT_TYPES = ['context_pack', 'spec', 'ai_doc', 'other'] as const;

const documentCreateSchema = z.object({
  title: z.string().min(1),
  docType: z.enum(DOCUMENT_TYPES),
  filePath: z.string().min(1),
  contentHash: z.string().min(1).nullable().optional(),
  version: z.number().int().positive().optional(),
  createdBy: z.string().min(1).nullable().optional(),
});

export function createDocumentsRouter({
  services,
  broadcast,
}: {
  services: Services;
  broadcast: BroadcastFn;
}): Router {
  const router = Router();

  router.get('/issues/:id/documents', async (req, res) => {
    const result = await services.documents.listByIssue(req.params.id);
    sendResult(res, result);
  });

  router.post('/issues/:id/documents', async (req, res) => {
    const parsed = documentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid document payload.', parsed.error.flatten());
      return;
    }

    const result = await services.documents.create(req.params.id, parsed.data);
    if (result.ok) {
      const payload = buildEventPayload(
        'document.created',
        result.value.projectId,
        result.value,
        result.value.issueId
      );
      broadcast(`project:${result.value.projectId}`, 'document.created', payload);
      if (result.value.issueId) {
        broadcast(`issue:${result.value.issueId}`, 'document.created', payload);
      }
    }
    sendResult(res, result);
  });

  return router;
}
