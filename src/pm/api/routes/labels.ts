import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { asyncHandler } from '../async-handler.js';
import {
  optionalBoolean,
  optionalString,
  requireString,
  STRING_LIMITS,
} from '../validation.js';

export function createLabelsRouter(context: ApiContext): Router {
  const router = Router();

  router.get(
    '/:id/labels',
    asyncHandler((req, res) => {
      const projectId = req.params.id as string;
      const labels = context.services.labels.listLabels(projectId);
      res.json({ data: labels });
    })
  );

  router.post(
    '/:id/labels',
    asyncHandler((req, res) => {
      const projectId = req.params.id as string;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = requireString(body.name, 'name', {
        maxLength: STRING_LIMITS.labelName,
      });
      const colorValue = optionalString(body.color, 'color', {
        maxLength: STRING_LIMITS.labelColor,
      });
      const color = colorValue === null ? undefined : colorValue;
      const description = optionalString(body.description, 'description', {
        maxLength: STRING_LIMITS.labelDescription,
      });
      const isBuiltin = optionalBoolean(body.isBuiltin, 'isBuiltin');

      const label = context.services.labels.createLabel(projectId, {
        name,
        color,
        description,
        isBuiltin,
      });

      const event = {
        type: 'label.created' as const,
        at: context.now(),
        projectId: label.projectId,
        payload: label,
      };

      context.broadcast(`project:${label.projectId}`, 'label.created', event);
      res.json({ data: label });
    })
  );

  return router;
}
