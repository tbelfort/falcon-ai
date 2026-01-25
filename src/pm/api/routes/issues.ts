import { Router } from 'express';
import type { IssueStage, IssuePriority } from '../../core/types.js';
import type { ApiContext } from '../context.js';
import { asyncHandler } from '../async-handler.js';
import {
  optionalEnum,
  optionalString,
  optionalStringArray,
  requireEnum,
  requireString,
  ARRAY_LIMITS,
  STRING_LIMITS,
} from '../validation.js';
import { validationError } from '../../core/services/errors.js';
import type { UpdateIssueInput } from '../../core/services/issues.js';

const ISSUE_PRIORITIES: IssuePriority[] = [
  'low',
  'medium',
  'high',
  'critical',
];

const ISSUE_STAGES: IssueStage[] = [
  'BACKLOG',
  'TODO',
  'CONTEXT_PACK',
  'CONTEXT_REVIEW',
  'SPEC',
  'SPEC_REVIEW',
  'IMPLEMENT',
  'PR_REVIEW',
  'PR_HUMAN_REVIEW',
  'FIXER',
  'TESTING',
  'DOC_REVIEW',
  'MERGE_READY',
  'DONE',
];

export function createIssuesRouter(context: ApiContext): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler((req, res) => {
      const projectIdParam = req.query.projectId;
      if (!projectIdParam || Array.isArray(projectIdParam)) {
        throw validationError('projectId is required', { field: 'projectId' });
      }
      const projectId = requireString(projectIdParam, 'projectId', {
        maxLength: STRING_LIMITS.id,
      });
      const issues = context.services.issues.listIssues(projectId);
      res.json({ data: issues });
    })
  );

  router.post(
    '/',
    asyncHandler((req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const projectId = requireString(body.projectId, 'projectId', {
        maxLength: STRING_LIMITS.id,
      });
      const title = requireString(body.title, 'title', {
        maxLength: STRING_LIMITS.issueTitle,
      });
      const description = optionalString(body.description, 'description', {
        maxLength: STRING_LIMITS.issueDescription,
      });
      const priority = optionalEnum(body.priority, 'priority', ISSUE_PRIORITIES);

      const issue = context.services.issues.createIssue({
        projectId,
        title,
        description,
        priority,
      });

      const event = {
        type: 'issue.created' as const,
        at: context.now(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: issue,
      };

      context.broadcast(`project:${issue.projectId}`, 'issue.created', event);
      context.broadcast(`issue:${issue.id}`, 'issue.created', event);
      res.json({ data: issue });
    })
  );

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const issue = context.services.issues.getIssue(issueId);
      res.json({ data: issue });
    })
  );

  router.patch(
    '/:id',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const update: UpdateIssueInput = {};

      if (Object.prototype.hasOwnProperty.call(body, 'title')) {
        update.title = requireString(body.title, 'title', {
          maxLength: STRING_LIMITS.issueTitle,
        });
      }

      if (Object.prototype.hasOwnProperty.call(body, 'description')) {
        const description = optionalString(body.description, 'description', {
          maxLength: STRING_LIMITS.issueDescription,
        });
        if (description !== undefined) {
          update.description = description;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
        update.priority = requireEnum(body.priority, 'priority', ISSUE_PRIORITIES);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'labelIds')) {
        const labelIds = optionalStringArray(body.labelIds, 'labelIds', {
          maxLength: STRING_LIMITS.id,
          maxItems: ARRAY_LIMITS.labelIds,
        });
        if (labelIds !== undefined) {
          update.labelIds = labelIds;
        }
      }

      const issue = context.services.issues.updateIssue(issueId, update);
      const event = {
        type: 'issue.updated' as const,
        at: context.now(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: issue,
      };

      context.broadcast(`project:${issue.projectId}`, 'issue.updated', event);
      context.broadcast(`issue:${issue.id}`, 'issue.updated', event);
      res.json({ data: issue });
    })
  );

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const issue = context.services.issues.deleteIssue(issueId);
      const event = {
        type: 'issue.deleted' as const,
        at: context.now(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: issue,
      };

      context.broadcast(`project:${issue.projectId}`, 'issue.deleted', event);
      context.broadcast(`issue:${issue.id}`, 'issue.deleted', event);
      res.json({ data: issue });
    })
  );

  router.post(
    '/:id/start',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const presetId = requireString(body.presetId, 'presetId', {
        maxLength: STRING_LIMITS.id,
      });

      const result = context.services.issues.startIssue(issueId, presetId);
      const event = {
        type: 'issue.updated' as const,
        at: context.now(),
        projectId: result.issue.projectId,
        issueId: result.issue.id,
        payload: result.issue,
      };

      context.broadcast(
        `project:${result.issue.projectId}`,
        'issue.updated',
        event
      );
      context.broadcast(`issue:${result.issue.id}`, 'issue.updated', event);

      res.json({
        data: {
          issue: result.issue,
          branchName: result.branchName,
          nextStage: result.nextStage,
        },
      });
    })
  );

  router.post(
    '/:id/transition',
    asyncHandler((req, res) => {
      const issueId = req.params.id as string;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const toStage = requireEnum(body.toStage, 'toStage', ISSUE_STAGES);

      const issue = context.services.issues.transitionIssue(issueId, toStage);
      const event = {
        type: 'issue.updated' as const,
        at: context.now(),
        projectId: issue.projectId,
        issueId: issue.id,
        payload: issue,
      };

      context.broadcast(`project:${issue.projectId}`, 'issue.updated', event);
      context.broadcast(`issue:${issue.id}`, 'issue.updated', event);
      res.json({ data: issue });
    })
  );

  return router;
}
