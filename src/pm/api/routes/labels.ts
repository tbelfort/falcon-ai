import { Router } from 'express';
import type { Request, Response } from 'express';
import type { LabelService, CreateLabelInput } from '../../core/services/label-service.js';
import { getHttpStatus } from '../http-errors.js';
import { broadcastProjectEvent } from '../websocket.js';

export function createLabelRoutes(labelService: LabelService): Router {
  const router = Router({ mergeParams: true });

  // GET /api/projects/:projectId/labels
  router.get('/', async (req: Request<{ projectId: string }>, res: Response) => {
    try {
      const result = await labelService.list(req.params.projectId);
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

  // POST /api/projects/:projectId/labels
  router.post('/', async (req: Request<{ projectId: string }>, res: Response) => {
    try {
      const input: CreateLabelInput = {
        name: req.body.name,
        color: req.body.color,
        description: req.body.description,
      };

      const result = await labelService.create(req.params.projectId, input);
      if (result.ok) {
        broadcastProjectEvent(req.params.projectId, 'label.created', result.value);
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
