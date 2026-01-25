import { Router } from 'express';
import type { Request, Response } from 'express';
import type { CommentService, CreateCommentInput } from '../../core/services/comment-service.js';
import { getHttpStatus } from '../http-errors.js';
import { broadcastIssueEvent } from '../websocket.js';

export function createCommentRoutes(
  commentService: CommentService,
  getIssueProjectId: (issueId: string) => Promise<string | null>
): Router {
  const router = Router({ mergeParams: true });

  // GET /api/issues/:issueId/comments
  router.get('/', async (req: Request<{ issueId: string }>, res: Response) => {
    try {
      const result = await commentService.list(req.params.issueId);
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

  // POST /api/issues/:issueId/comments
  router.post('/', async (req: Request<{ issueId: string }>, res: Response) => {
    try {
      const input: CreateCommentInput = {
        content: req.body.content,
        authorType: req.body.authorType,
        authorName: req.body.authorName,
        parentId: req.body.parentId,
      };

      const result = await commentService.create(req.params.issueId, input);
      if (result.ok) {
        const projectId = await getIssueProjectId(req.params.issueId);
        if (projectId) {
          broadcastIssueEvent(projectId, req.params.issueId, 'comment.created', result.value);
        }
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
