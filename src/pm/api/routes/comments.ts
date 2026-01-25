import { Router } from 'express';
import type { CommentAuthorType } from '../../core/types.js';
import type { ApiContext } from '../context.js';
import { asyncHandler } from '../async-handler.js';
import { optionalString, requireEnum, requireString } from '../validation.js';

const AUTHOR_TYPES: CommentAuthorType[] = ['agent', 'human'];

export function createCommentsRouter(context: ApiContext): Router {
  const router = Router();

  router.get(
    '/:id/comments',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const comments = context.services.comments.listComments(issueId);
      res.json({ data: comments });
    })
  );

  router.post(
    '/:id/comments',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const content = requireString(body.content, 'content');
      const authorType = requireEnum(body.authorType, 'authorType', AUTHOR_TYPES);
      const authorName = requireString(body.authorName, 'authorName');
      const parentId = optionalString(body.parentId, 'parentId');

      const issue = context.services.issues.getIssue(issueId);
      const comment = context.services.comments.createComment(issueId, {
        content,
        authorType,
        authorName,
        parentId,
      });

      const event = {
        type: 'comment.created' as const,
        at: context.now(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: comment,
      };

      context.broadcast(`project:${issue.projectId}`, 'comment.created', event);
      context.broadcast(`issue:${issue.id}`, 'comment.created', event);
      res.json({ data: comment });
    })
  );

  return router;
}
