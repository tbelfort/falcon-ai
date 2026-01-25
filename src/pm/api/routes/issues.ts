import { Router } from 'express';
import type { IssuesService } from '../../core/services/issues.service.js';
import { toApiError, getHttpStatus } from '../http-errors.js';
import { getBroadcaster } from '../websocket.js';

export function createIssuesRouter(
  issuesService: IssuesService
): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId || typeof projectId !== 'string') {
        throw new Error('VALIDATION_ERROR');
      }
      const result = await issuesService.getIssues(projectId);
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { projectId, title, description, priority } = req.body;
      if (!projectId || !title) {
        throw new Error('VALIDATION_ERROR');
      }
      const result = await issuesService.createIssue({
        projectId,
        title,
        description,
        priority,
      });
      const broadcast = getBroadcaster();
      broadcast('project:' + projectId, 'issue.created', result.data);
      broadcast('issue:' + result.data.id, 'issue.created', result.data);
      res.status(201).json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const result = await issuesService.getIssue(req.params.id);
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const result = await issuesService.updateIssue(req.params.id, req.body);
      const broadcast = getBroadcaster();
      broadcast('issue:' + req.params.id, 'issue.updated', result.data);
      if (result.data.projectId) {
        broadcast('project:' + result.data.projectId, 'issue.updated', result.data);
      }
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.post('/:id/start', async (req, res) => {
    try {
      const { presetId } = req.body;
      if (!presetId) {
        throw new Error('VALIDATION_ERROR');
      }
      const result = await issuesService.startIssue(req.params.id, presetId);
      const broadcast = getBroadcaster();
      broadcast('issue:' + req.params.id, 'issue.updated', result.data.issue);
      if (result.data.issue.projectId) {
        broadcast('project:' + result.data.issue.projectId, 'issue.updated', result.data.issue);
      }
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.post('/:id/transition', async (req, res) => {
    try {
      const { toStage } = req.body;
      if (!toStage) {
        throw new Error('VALIDATION_ERROR');
      }
      const result = await issuesService.transitionIssue(req.params.id, toStage);
      const broadcast = getBroadcaster();
      broadcast('issue:' + req.params.id, 'issue.updated', result.data);
      if (result.data.projectId) {
        broadcast('project:' + result.data.projectId, 'issue.updated', result.data);
      }
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const result = await issuesService.deleteIssue(req.params.id);
      const broadcast = getBroadcaster();
      broadcast('issue:' + req.params.id, 'issue.deleted', result.data);
      if (result.data.projectId) {
        broadcast('project:' + result.data.projectId, 'issue.deleted', result.data);
      }
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  return router;
}