import { Router } from 'express';
import type {
  ApiResponse,
  IssueDto,
  IssuePriority,
} from '../../contracts/http.js';
import { STAGE_TRANSITIONS } from '../../core/stage-machine.js';
import { getUnixSeconds } from '../../core/services/helpers.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcast } from '../websocket.js';
import {
  optionalNullableString,
  optionalString,
  requireEnum,
  requireString,
  requireStringArray,
} from '../validation.js';

const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const ISSUE_STAGES = Object.keys(STAGE_TRANSITIONS) as IssueDto['stage'][];

export function createIssuesRouter(services: PmServices): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const projectId = requireString(req.query.projectId, 'projectId');
      const issues = await services.issues.listByProject(projectId);
      const response: ApiResponse<IssueDto[]> = { data: issues };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const issue = await services.issues.create({
        projectId: requireString(body.projectId, 'projectId'),
        title: requireString(body.title, 'title'),
        description: optionalNullableString(body.description, 'description'),
        priority:
          body.priority === undefined
            ? undefined
            : requireEnum<IssuePriority>(
                body.priority,
                'priority',
                ISSUE_PRIORITIES
              ),
      });

      const eventPayload = {
        type: 'issue.created' as const,
        at: getUnixSeconds(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: issue,
      };
      broadcast(`project:${issue.projectId}`, 'issue.created', eventPayload);
      broadcast(`issue:${issue.id}`, 'issue.created', eventPayload);

      const response: ApiResponse<IssueDto> = { data: issue };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const issue = await services.issues.get(req.params.id);
      const response: ApiResponse<IssueDto> = { data: issue };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const labelIds =
        body.labelIds === undefined
          ? undefined
          : requireStringArray(body.labelIds, 'labelIds');
      const issue = await services.issues.update(req.params.id, {
        title: optionalString(body.title, 'title'),
        description: optionalNullableString(body.description, 'description'),
        priority:
          body.priority === undefined
            ? undefined
            : requireEnum<IssuePriority>(
                body.priority,
                'priority',
                ISSUE_PRIORITIES
              ),
        labelIds,
      });

      const eventPayload = {
        type: 'issue.updated' as const,
        at: getUnixSeconds(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: issue,
      };
      broadcast(`project:${issue.projectId}`, 'issue.updated', eventPayload);
      broadcast(`issue:${issue.id}`, 'issue.updated', eventPayload);

      const response: ApiResponse<IssueDto> = { data: issue };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/start', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const result = await services.issues.start(req.params.id, {
        presetId: requireString(body.presetId, 'presetId'),
      });

      const eventPayload = {
        type: 'issue.updated' as const,
        at: getUnixSeconds(),
        projectId: result.issue.projectId,
        issueId: result.issue.id,
        payload: result.issue,
      };
      broadcast(
        `project:${result.issue.projectId}`,
        'issue.updated',
        eventPayload
      );
      broadcast(`issue:${result.issue.id}`, 'issue.updated', eventPayload);

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/transition', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const issue = await services.issues.transition(req.params.id, {
        toStage: requireEnum(body.toStage, 'toStage', ISSUE_STAGES),
      });

      const eventPayload = {
        type: 'issue.updated' as const,
        at: getUnixSeconds(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: issue,
      };
      broadcast(`project:${issue.projectId}`, 'issue.updated', eventPayload);
      broadcast(`issue:${issue.id}`, 'issue.updated', eventPayload);

      const response: ApiResponse<IssueDto> = { data: issue };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const issue = await services.issues.delete(req.params.id);
      const eventPayload = {
        type: 'issue.deleted' as const,
        at: getUnixSeconds(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: issue,
      };
      broadcast(`project:${issue.projectId}`, 'issue.deleted', eventPayload);
      broadcast(`issue:${issue.id}`, 'issue.deleted', eventPayload);

      const response: ApiResponse<IssueDto> = { data: issue };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
