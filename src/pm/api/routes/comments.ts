import { Router, type Request } from 'express';
import type { ApiResponse, CommentDto } from '../../contracts/http.js';
import { getUnixSeconds } from '../../core/services/helpers.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcast } from '../websocket.js';
import {
  optionalNullableString,
  requireEnum,
  requireString,
} from '../validation.js';

const AUTHOR_TYPES = ['agent', 'human'] as const;

export function createCommentsRouter(services: PmServices): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req: Request<{ issueId: string }>, res, next) => {
    try {
      const issueId = requireString(req.params.issueId, 'issueId');
      const comments = await services.comments.listByIssue(issueId);
      const response: ApiResponse<CommentDto[]> = { data: comments };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req: Request<{ issueId: string }>, res, next) => {
    try {
      const issueId = requireString(req.params.issueId, 'issueId');
      const issue = await services.issues.get(issueId);
      const body = req.body ?? {};
      const comment = await services.comments.create(issueId, {
        content: requireString(body.content, 'content'),
        authorType: requireEnum(body.authorType, 'authorType', AUTHOR_TYPES),
        authorName: requireString(body.authorName, 'authorName'),
        parentId: optionalNullableString(body.parentId, 'parentId'),
      });

      const eventPayload = {
        type: 'comment.created' as const,
        at: getUnixSeconds(),
        projectId: issue.projectId,
        issueId,
        payload: comment,
      };
      broadcast(`project:${issue.projectId}`, 'comment.created', eventPayload);
      broadcast(`issue:${issueId}`, 'comment.created', eventPayload);

      const response: ApiResponse<CommentDto> = { data: comment };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
