import { Router } from 'express';
import type { ApiResponse, ProjectDto } from '../../contracts/http.js';
import { getUnixSeconds } from '../../core/services/helpers.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcast } from '../websocket.js';
import {
  optionalNullableString,
  optionalString,
  requireString,
} from '../validation.js';

export function createProjectsRouter(services: PmServices): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      void _req;
      const projects = await services.projects.list();
      const response: ApiResponse<ProjectDto[]> = { data: projects };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const project = await services.projects.create({
        name: requireString(body.name, 'name'),
        slug: requireString(body.slug, 'slug'),
        description: optionalNullableString(body.description, 'description'),
        repoUrl: optionalNullableString(body.repoUrl, 'repoUrl'),
        defaultBranch: optionalString(body.defaultBranch, 'defaultBranch'),
      });

      const eventPayload = {
        type: 'project.created' as const,
        at: getUnixSeconds(),
        projectId: project.id,
        payload: project,
      };
      broadcast(`project:${project.id}`, 'project.created', eventPayload);

      const response: ApiResponse<ProjectDto> = { data: project };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const project = await services.projects.get(req.params.id);
      const response: ApiResponse<ProjectDto> = { data: project };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const project = await services.projects.update(req.params.id, {
        name: optionalString(body.name, 'name'),
        slug: optionalString(body.slug, 'slug'),
        description: optionalNullableString(body.description, 'description'),
        repoUrl: optionalNullableString(body.repoUrl, 'repoUrl'),
        defaultBranch: optionalString(body.defaultBranch, 'defaultBranch'),
        config: body.config,
      });

      const eventPayload = {
        type: 'project.updated' as const,
        at: getUnixSeconds(),
        projectId: project.id,
        payload: project,
      };
      broadcast(`project:${project.id}`, 'project.updated', eventPayload);

      const response: ApiResponse<ProjectDto> = { data: project };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const project = await services.projects.delete(req.params.id);
      const eventPayload = {
        type: 'project.deleted' as const,
        at: getUnixSeconds(),
        projectId: project.id,
        payload: project,
      };
      broadcast(`project:${project.id}`, 'project.deleted', eventPayload);

      const response: ApiResponse<ProjectDto> = { data: project };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
