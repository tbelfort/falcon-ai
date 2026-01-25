import { randomUUID } from 'node:crypto';
import type { CommentDto } from '../../contracts/http.js';
import { PmError } from '../errors.js';
import type { CommentsRepo, IssuesRepo } from '../repos/index.js';
import { getUnixSeconds } from './helpers.js';

export interface CreateCommentInput {
  content: string;
  authorType: CommentDto['authorType'];
  authorName: string;
  parentId?: string | null;
}

export interface CommentsService {
  listByIssue(issueId: string): Promise<CommentDto[]>;
  create(issueId: string, input: CreateCommentInput): Promise<CommentDto>;
}

export function createCommentsService(
  commentsRepo: CommentsRepo,
  issuesRepo: IssuesRepo
): CommentsService {
  return {
    async listByIssue(issueId) {
      const issue = await issuesRepo.getById(issueId);
      if (!issue) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }
      return commentsRepo.listByIssue(issueId);
    },
    async create(issueId, input) {
      const issue = await issuesRepo.getById(issueId);
      if (!issue) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }

      const now = getUnixSeconds();
      const comment: CommentDto = {
        id: randomUUID(),
        issueId,
        content: input.content,
        authorType: input.authorType,
        authorName: input.authorName,
        parentId: input.parentId ?? null,
        createdAt: now,
        updatedAt: now,
      };

      return commentsRepo.create(comment);
    },
  };
}
