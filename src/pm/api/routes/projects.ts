import { Router } from 'express';
import type { ApiContext } from '../context.js';
import { asyncHandler } from '../async-handler.js';
import {
  optionalString,
  requireJsonObject,
  requireString,
  STRING_LIMITS,
} from '../validation.js';
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
      const name = requireString(body.name, 'name', {
        maxLength: STRING_LIMITS.projectName,
      });
      const slug = requireString(body.slug, 'slug', {
        maxLength: STRING_LIMITS.projectSlug,
      });
      const description = optionalString(body.description, 'description', {
        maxLength: STRING_LIMITS.projectDescription,
      });
      const repoUrl = optionalString(body.repoUrl, 'repoUrl', {
        maxLength: STRING_LIMITS.repoUrl,
      });
      const defaultBranch = requireString(body.defaultBranch, 'defaultBranch', {
        maxLength: STRING_LIMITS.defaultBranch,
      });
      const config = Object.prototype.hasOwnProperty.call(body, 'config')
        ? requireJsonObject(body.config, 'config')
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
        update.name = requireString(body.name, 'name', {
          maxLength: STRING_LIMITS.projectName,
        });
      }

      if (Object.prototype.hasOwnProperty.call(body, 'slug')) {
        update.slug = requireString(body.slug, 'slug', {
          maxLength: STRING_LIMITS.projectSlug,
        });
      }

      if (Object.prototype.hasOwnProperty.call(body, 'description')) {
        const description = optionalString(body.description, 'description', {
          maxLength: STRING_LIMITS.projectDescription,
        });
        if (description !== undefined) {
          update.description = description;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'repoUrl')) {
        const repoUrl = optionalString(body.repoUrl, 'repoUrl', {
          maxLength: STRING_LIMITS.repoUrl,
        });
        if (repoUrl !== undefined) {
          update.repoUrl = repoUrl;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'defaultBranch')) {
        update.defaultBranch = requireString(body.defaultBranch, 'defaultBranch', {
          maxLength: STRING_LIMITS.defaultBranch,
        });
      }

      if (Object.prototype.hasOwnProperty.call(body, 'config')) {
        update.config = requireJsonObject(body.config, 'config');
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
