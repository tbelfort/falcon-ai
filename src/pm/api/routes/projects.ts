import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ProjectService, CreateProjectInput, UpdateProjectInput } from '../../core/services/project-service.js';
import { getHttpStatus } from '../http-errors.js';
import { broadcastProjectEvent } from '../websocket.js';

export function createProjectRoutes(projectService: ProjectService): Router {
  const router = Router();

  // GET /api/projects
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const result = await projectService.list();
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

  // GET /api/projects/:id
  router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const result = await projectService.get(req.params.id);
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

  // POST /api/projects
  router.post('/', async (req: Request, res: Response) => {
    try {
      const input: CreateProjectInput = {
        name: req.body.name,
        slug: req.body.slug,
        description: req.body.description,
        repoUrl: req.body.repoUrl,
        defaultBranch: req.body.defaultBranch,
      };

      const result = await projectService.create(input);
      if (result.ok) {
        broadcastProjectEvent(result.value.id, 'project.created', result.value);
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

  // PATCH /api/projects/:id
  router.patch('/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const input: UpdateProjectInput = {};
      if (req.body.name !== undefined) input.name = req.body.name;
      if (req.body.slug !== undefined) input.slug = req.body.slug;
      if (req.body.description !== undefined) input.description = req.body.description;
      if (req.body.repoUrl !== undefined) input.repoUrl = req.body.repoUrl;
      if (req.body.defaultBranch !== undefined) input.defaultBranch = req.body.defaultBranch;

      const result = await projectService.update(req.params.id, input);
      if (result.ok) {
        broadcastProjectEvent(result.value.id, 'project.updated', result.value);
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

  // DELETE /api/projects/:id
  router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = req.params.id;
      // Get project before deletion for broadcast
      const getResult = await projectService.get(id);

      const result = await projectService.delete(id);
      if (result.ok) {
        if (getResult.ok) {
          broadcastProjectEvent(id, 'project.deleted', getResult.value);
        }
        res.status(204).send();
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
