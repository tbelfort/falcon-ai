import { Router } from 'express';
import { z } from 'zod';
import { createError } from '../../core/errors.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcastEvents, type WsBroadcaster } from '../broadcast.js';
import { sendError } from '../http-errors.js';
import { sendSuccess } from '../response.js';
import { LIMITS, parsePagination } from '../validation.js';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{3,8}$/;

const createLabelSchema = z.object({
  name: z.string().min(1).max(LIMITS.name),
  color: z.string().min(1).max(LIMITS.color).regex(HEX_COLOR_REGEX, 'Invalid hex color format').optional(),
  description: z.string().min(1).max(LIMITS.description).nullable().optional(),
  isBuiltin: z.boolean().optional(),
});

export function createLabelsRouter(
  services: PmServices,
  broadcaster: WsBroadcaster
) {
  const router = Router({ mergeParams: true });

  router.get('/', (req, res) => {
    const pagination = parsePagination(req.query.page, req.query.perPage);
    if (!pagination) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid pagination parameters')
      );
    }

    const params = req.params as Record<string, string>;
    const projectId = params.id;
    const result = services.labels.listByProject(projectId);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    const { page, perPage } = pagination;
    const start = (page - 1) * perPage;
    const items = result.value.slice(start, start + perPage);
    return sendSuccess(res, items, { total: result.value.length, page, perPage });
  });

  router.post('/', (req, res) => {
    const parsed = createLabelSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid label payload', parsed.error.flatten())
      );
    }

    const params = req.params as Record<string, string>;
    const result = services.labels.createLabel({
      projectId: params.id,
      name: parsed.data.name,
      color: parsed.data.color ?? '#6b7280',
      description: parsed.data.description ?? null,
      isBuiltin: parsed.data.isBuiltin ?? false,
    });

    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  return router;
}
