import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  IssueService,
  CreateIssueInput,
  UpdateIssueInput,
  StartIssueInput,
  TransitionIssueInput,
} from '../../core/services/issue-service.js';
import type { IssueStage } from '../../core/types.js';
import { getHttpStatus } from '../http-errors.js';
import { broadcastIssueEvent } from '../websocket.js';

export function createIssueRoutes(issueService: IssueService): Router {
  const router = Router();

  // GET /api/issues?projectId=...
  router.get('/', async (req: Request, res: Response) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      const result = await issueService.list(projectId);
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

  // GET /api/issues/:id
  router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const result = await issueService.get(req.params.id);
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

  // POST /api/issues
  router.post('/', async (req: Request, res: Response) => {
    try {
      const input: CreateIssueInput = {
        projectId: req.body.projectId,
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority,
      };

      const result = await issueService.create(input);
      if (result.ok) {
        broadcastIssueEvent(result.value.projectId, result.value.id, 'issue.created', result.value);
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

  // PATCH /api/issues/:id
  router.patch('/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const input: UpdateIssueInput = {};
      if (req.body.title !== undefined) input.title = req.body.title;
      if (req.body.description !== undefined) input.description = req.body.description;
      if (req.body.priority !== undefined) input.priority = req.body.priority;
      if (req.body.labelIds !== undefined) input.labelIds = req.body.labelIds;

      const result = await issueService.update(req.params.id, input);
      if (result.ok) {
        broadcastIssueEvent(result.value.projectId, result.value.id, 'issue.updated', result.value);
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

  // POST /api/issues/:id/start
  router.post('/:id/start', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const input: StartIssueInput = {
        presetId: req.body.presetId,
      };

      const result = await issueService.start(req.params.id, input);
      if (result.ok) {
        broadcastIssueEvent(
          result.value.issue.projectId,
          result.value.issue.id,
          'issue.updated',
          result.value.issue
        );
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

  // POST /api/issues/:id/transition
  router.post('/:id/transition', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const input: TransitionIssueInput = {
        toStage: req.body.toStage as IssueStage,
      };

      const result = await issueService.transition(req.params.id, input);
      if (result.ok) {
        broadcastIssueEvent(result.value.projectId, result.value.id, 'issue.updated', result.value);
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

  // DELETE /api/issues/:id
  router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = req.params.id;
      // Get issue before deletion for broadcast
      const getResult = await issueService.get(id);

      const result = await issueService.delete(id);
      if (result.ok) {
        if (getResult.ok) {
          broadcastIssueEvent(getResult.value.projectId, id, 'issue.deleted', getResult.value);
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
