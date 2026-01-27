import { Router } from 'express';
import { z } from 'zod';
import { createError } from '../../../core/errors.js';
import type { PmServices } from '../../../core/services/index.js';
import type { AgentDto, IssueDto } from '../../../contracts/http.js';
import { sendError } from '../../http-errors.js';
import { sendSuccess } from '../../response.js';
import { isSafeRelativePath, LIMITS, requireString } from '../../validation.js';

const issueStageSchema = z.enum([
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
]);

const createCommentSchema = z.object({
  content: z.string().min(1).max(LIMITS.comment),
});

const createStageMessageSchema = z.object({
  toStage: issueStageSchema,
  message: z.string().min(1).max(LIMITS.comment),
  priority: z.enum(['normal', 'important']).optional(),
});

const workCompleteSchema = z.object({
  summary: z.string().min(1).max(LIMITS.description),
  filesChanged: z.array(z.string().min(1).max(LIMITS.filePath)).max(LIMITS.labelIds),
  testsPassed: z.boolean(),
});

const errorSchema = z.object({
  errorType: z.string().min(1).max(LIMITS.name),
  message: z.string().min(1).max(LIMITS.description),
  details: z.string().min(1).max(LIMITS.description).optional(),
});

function requireAgentId(headerValue: string | undefined) {
  const agentId = requireString(headerValue);
  if (!agentId || agentId.length > LIMITS.id) {
    return null;
  }
  return agentId;
}

function resolveAgentIssue(
  services: PmServices,
  issueId: string,
  agentProjectId: string,
  res: Parameters<typeof sendError>[0]
): IssueDto | null {
  const issueResult = services.issues.getIssue(issueId);
  if (!issueResult.ok) {
    sendError(res, issueResult.error);
    return null;
  }

  const issue = issueResult.value as IssueDto;
  if (issue.projectId !== agentProjectId) {
    sendError(res, createError('VALIDATION_ERROR', 'Agent is not assigned to this project'));
    return null;
  }

  return issue;
}

export function createAgentIssuesRouter(services: PmServices) {
  const router = Router();

  router.get('/:id/context', (req, res) => {
    const agentId = requireAgentId(req.header('X-Agent-ID'));
    if (!agentId) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'X-Agent-ID header is required')
      );
    }

    const agentResult = services.agents.getAgent(agentId);
    if (!agentResult.ok) {
      return sendError(res, agentResult.error);
    }
    const agent = agentResult.value as AgentDto;

    const params = req.params as Record<string, string>;
    const issue = resolveAgentIssue(services, params.id, agent.projectId, res);
    if (!issue) {
      return;
    }

    const projectResult = services.projects.getProject(issue.projectId);
    if (!projectResult.ok) {
      return sendError(res, projectResult.error);
    }

    const documentsResult = services.documents.listByIssue(params.id);
    if (!documentsResult.ok) {
      return sendError(res, documentsResult.error);
    }

    const stageMessagesResult = services.stageMessages.listByIssue(params.id);
    if (!stageMessagesResult.ok) {
      return sendError(res, stageMessagesResult.error);
    }

    const workflowResult = services.workflowRuns.listByIssue(params.id);
    if (!workflowResult.ok) {
      return sendError(res, workflowResult.error);
    }

    return sendSuccess(res, {
      issue,
      project: projectResult.value,
      documents: documentsResult.value,
      stageMessages: stageMessagesResult.value,
      workflow: { runs: workflowResult.value },
    });
  });

  router.get('/:id/messages', (req, res) => {
    const agentId = requireAgentId(req.header('X-Agent-ID'));
    if (!agentId) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'X-Agent-ID header is required')
      );
    }

    const agentResult = services.agents.getAgent(agentId);
    if (!agentResult.ok) {
      return sendError(res, agentResult.error);
    }
    const agent = agentResult.value as AgentDto;

    const forStageValue = requireString(req.query.forStage);
    if (!forStageValue) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'forStage query parameter is required')
      );
    }

    const stageParsed = issueStageSchema.safeParse(forStageValue);
    if (!stageParsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid forStage value')
      );
    }

    const params = req.params as Record<string, string>;
    const issue = resolveAgentIssue(services, params.id, agent.projectId, res);
    if (!issue) {
      return;
    }

    const result = services.stageMessages.readUnreadMessages(
      params.id,
      stageParsed.data,
      agentId
    );
    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.post('/:id/comment', (req, res) => {
    const agentId = requireAgentId(req.header('X-Agent-ID'));
    if (!agentId) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'X-Agent-ID header is required')
      );
    }

    const agentResult = services.agents.getAgent(agentId);
    if (!agentResult.ok) {
      return sendError(res, agentResult.error);
    }
    const agent = agentResult.value as AgentDto;

    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid comment payload', parsed.error.flatten())
      );
    }

    const params = req.params as Record<string, string>;
    const issue = resolveAgentIssue(services, params.id, agent.projectId, res);
    if (!issue) {
      return;
    }

    const result = services.comments.createComment({
      issueId: params.id,
      content: parsed.data.content,
      authorType: 'agent',
      authorName: agent.name,
      parentId: null,
    });

    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.post('/:id/stage-message', (req, res) => {
    const agentId = requireAgentId(req.header('X-Agent-ID'));
    if (!agentId) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'X-Agent-ID header is required')
      );
    }

    const agentResult = services.agents.getAgent(agentId);
    if (!agentResult.ok) {
      return sendError(res, agentResult.error);
    }
    const agent = agentResult.value as AgentDto;

    const parsed = createStageMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError(
          'VALIDATION_ERROR',
          'Invalid stage message payload',
          parsed.error.flatten()
        )
      );
    }

    const params = req.params as Record<string, string>;
    const issue = resolveAgentIssue(services, params.id, agent.projectId, res);
    if (!issue) {
      return;
    }

    const result = services.stageMessages.createStageMessage({
      issueId: params.id,
      fromStage: issue.stage,
      toStage: parsed.data.toStage,
      fromAgent: agentId,
      message: parsed.data.message,
      priority: parsed.data.priority,
    });

    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.post('/:id/work-complete', (req, res) => {
    const agentId = requireAgentId(req.header('X-Agent-ID'));
    if (!agentId) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'X-Agent-ID header is required')
      );
    }

    const agentResult = services.agents.getAgent(agentId);
    if (!agentResult.ok) {
      return sendError(res, agentResult.error);
    }
    const agent = agentResult.value as AgentDto;

    const parsed = workCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError(
          'VALIDATION_ERROR',
          'Invalid work-complete payload',
          parsed.error.flatten()
        )
      );
    }

    const invalidPath = parsed.data.filesChanged.find(
      (filePath) => !isSafeRelativePath(filePath)
    );
    if (invalidPath) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid filesChanged path')
      );
    }

    const params = req.params as Record<string, string>;
    const issue = resolveAgentIssue(services, params.id, agent.projectId, res);
    if (!issue) {
      return;
    }

    const result = services.workflowRuns.recordCompletion({
      issueId: params.id,
      agentId,
      stage: issue.stage,
      summary: parsed.data.summary,
      filesChanged: parsed.data.filesChanged,
      testsPassed: parsed.data.testsPassed,
    });

    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.post('/:id/error', (req, res) => {
    const agentId = requireAgentId(req.header('X-Agent-ID'));
    if (!agentId) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'X-Agent-ID header is required')
      );
    }

    const agentResult = services.agents.getAgent(agentId);
    if (!agentResult.ok) {
      return sendError(res, agentResult.error);
    }
    const agent = agentResult.value as AgentDto;

    const parsed = errorSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid error payload', parsed.error.flatten())
      );
    }

    const params = req.params as Record<string, string>;
    const issue = resolveAgentIssue(services, params.id, agent.projectId, res);
    if (!issue) {
      return;
    }

    const result = services.workflowRuns.recordError({
      issueId: params.id,
      agentId,
      stage: issue.stage,
      errorType: parsed.data.errorType,
      message: parsed.data.message,
      details: parsed.data.details,
    });

    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  return router;
}
