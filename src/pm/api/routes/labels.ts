import { Router } from 'express';
import type { LabelsService } from '../../core/services/labels.service.js';
import { toApiError, getHttpStatus } from '../http-errors.js';
import { getBroadcaster } from '../websocket.js';

export function createLabelsRouter(
  labelsService: LabelsService
): Router {
  const router = Router();

  router.get('/projects/:projectId/labels', async (req, res) => {
    try {
      const result = await labelsService.getProjectLabels(req.params.projectId);
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.post('/projects/:projectId/labels', async (req, res) => {
    try {
      const { name, color, description } = req.body;
      if (!name) {
        throw new Error('VALIDATION_ERROR');
      }
      const result = await labelsService.createLabel({
        projectId: req.params.projectId,
        name,
        color,
        description,
      });
      const broadcast = getBroadcaster();
      broadcast('project:' + req.params.projectId, 'label.created', result.data);
      res.status(201).json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  return router;
}