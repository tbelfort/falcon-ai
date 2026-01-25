import { Router } from 'express';
import type { ProjectsService } from '../../core/services/projects.service.js';
import { toApiError, getHttpStatus } from '../http-errors.js';
import { getBroadcaster } from '../websocket.js';

export function createProjectsRouter(
  projectsService: ProjectsService
): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const result = await projectsService.getProjects();
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { name, slug, description, repoUrl, defaultBranch, config } = req.body;
      if (!name || !slug) {
        throw new Error('VALIDATION_ERROR');
      }
      const result = await projectsService.createProject({
        name,
        slug,
        description,
        repoUrl,
        defaultBranch,
        config,
      });
      const broadcast = getBroadcaster();
      broadcast('project:' + result.data.id, 'project.created', result.data);
      res.status(201).json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const result = await projectsService.getProject(req.params.id);
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const result = await projectsService.updateProject(req.params.id, req.body);
      const broadcast = getBroadcaster();
      broadcast('project:' + req.params.id, 'project.updated', result.data);
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const result = await projectsService.deleteProject(req.params.id);
      const broadcast = getBroadcaster();
      broadcast('project:' + req.params.id, 'project.deleted', result.data);
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  return router;
}