import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { asyncHandler } from '../async-handler.js';
import { optionalString, requireString } from '../validation.js';
import type { UpdateProjectInput } from '../../core/services/projects.js';

export function createProjectsRouter(context: ApiContext): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler((req, res) => {
      void req;
      const projects = context.services.projects.listProjects();
      res.json({ data: projects });
    })
  );

  router.post(
    '/',
    asyncHandler((req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = requireString(body.name, 'name');
      const slug = requireString(body.slug, 'slug');
      const description = optionalString(body.description, 'description');
      const repoUrl = optionalString(body.repoUrl, 'repoUrl');
      const defaultBranch = requireString(body.defaultBranch, 'defaultBranch');
      const config = Object.prototype.hasOwnProperty.call(body, 'config')
        ? body.config
        : undefined;

      const project = context.services.projects.createProject({
        name,
        slug,
        description,
        repoUrl,
        defaultBranch,
        config,
      });

      const event = {
        type: 'project.created' as const,
        at: context.now(),
        projectId: project.id,
        payload: project,
      };

      context.broadcast(`project:${project.id}`, 'project.created', event);
      res.json({ data: project });
    })
  );

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const projectId = req.params.id as string;
      const project = context.services.projects.getProject(projectId);
      res.json({ data: project });
    })
  );

  router.patch(
    '/:id',
    asyncHandler((req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const update: UpdateProjectInput = {};

      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        update.name = requireString(body.name, 'name');
      }

      if (Object.prototype.hasOwnProperty.call(body, 'slug')) {
        update.slug = requireString(body.slug, 'slug');
      }

      if (Object.prototype.hasOwnProperty.call(body, 'description')) {
        const description = optionalString(body.description, 'description');
        if (description !== undefined) {
          update.description = description;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'repoUrl')) {
        const repoUrl = optionalString(body.repoUrl, 'repoUrl');
        if (repoUrl !== undefined) {
          update.repoUrl = repoUrl;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'defaultBranch')) {
        update.defaultBranch = requireString(body.defaultBranch, 'defaultBranch');
      }

      if (Object.prototype.hasOwnProperty.call(body, 'config')) {
        update.config = body.config;
      }

      const projectId = req.params.id as string;
      const project = context.services.projects.updateProject(projectId, update);

      const event = {
        type: 'project.updated' as const,
        at: context.now(),
        projectId: project.id,
        payload: project,
      };

      context.broadcast(`project:${project.id}`, 'project.updated', event);
      res.json({ data: project });
    })
  );

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      const projectId = req.params.id as string;
      const project = context.services.projects.deleteProject(projectId);
      const event = {
        type: 'project.deleted' as const,
        at: context.now(),
        projectId: project.id,
        payload: project,
      };
      context.broadcast(`project:${project.id}`, 'project.deleted', event);
      res.json({ data: project });
    })
  );

  return router;
}
