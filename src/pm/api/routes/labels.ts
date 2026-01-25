import { Router, type Request } from 'express';
import type { ApiResponse, LabelDto } from '../../contracts/http.js';
import { getUnixSeconds } from '../../core/services/helpers.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcast } from '../websocket.js';
import {
  optionalNullableString,
  optionalString,
  requireString,
} from '../validation.js';

export function createLabelsRouter(services: PmServices): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req: Request<{ projectId: string }>, res, next) => {
    try {
      const projectId = requireString(req.params.projectId, 'projectId');
      const labels = await services.labels.listByProject(projectId);
      const response: ApiResponse<LabelDto[]> = { data: labels };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req: Request<{ projectId: string }>, res, next) => {
    try {
      const projectId = requireString(req.params.projectId, 'projectId');
      const body = req.body ?? {};
      const label = await services.labels.create(projectId, {
        name: requireString(body.name, 'name'),
        color: optionalString(body.color, 'color'),
        description: optionalNullableString(body.description, 'description'),
      });

      const eventPayload = {
        type: 'label.created' as const,
        at: getUnixSeconds(),
        projectId: label.projectId,
        payload: label,
      };
      broadcast(`project:${label.projectId}`, 'label.created', eventPayload);

      const response: ApiResponse<LabelDto> = { data: label };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
