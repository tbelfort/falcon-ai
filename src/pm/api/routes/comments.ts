import { Router } from 'express';
import type { CommentsService } from '../../core/services/comments.service.js';
import { toApiError, getHttpStatus } from '../http-errors.js';
import { getBroadcaster } from '../websocket.js';

export function createCommentsRouter(
  commentsService: CommentsService
): Router {
  const router = Router();

  router.get('/issues/:issueId/comments', async (req, res) => {
    try {
      const result = await commentsService.getIssueComments(req.params.issueId);
      res.json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  router.post('/issues/:issueId/comments', async (req, res) => {
    try {
      const { content, authorType, authorName, parentId } = req.body;
      if (!content || !authorType || !authorName) {
        throw new Error('VALIDATION_ERROR');
      }
      const result = await commentsService.createComment({
        issueId: req.params.issueId,
        content,
        authorType,
        authorName,
        parentId,
      });
      const broadcast = getBroadcaster();
      broadcast('comment:' + result.data.id, 'comment.created', result.data);
      broadcast('issue:' + req.params.issueId, 'comment.created', result.data);
      res.status(201).json(result);
    } catch (error) {
      const err = toApiError(error);
      res.status(getHttpStatus(err.error.code)).json(err);
    }
  });

  return router;
}