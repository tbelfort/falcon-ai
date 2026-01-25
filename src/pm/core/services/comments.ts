import { randomUUID } from 'node:crypto';
import type { Comment } from '../types.js';
import type { CommentRepository } from '../repos/comments-repo.js';
import type { IssueRepository } from '../repos/issues-repo.js';
import { notFoundError } from './errors.js';

export interface CreateCommentInput {
  content: string;
  authorType: 'agent' | 'human';
  authorName: string;
  parentId?: string | null;
}

export interface CommentService {
  listComments(issueId: string): Comment[];
  createComment(issueId: string, input: CreateCommentInput): Comment;
}

export function createCommentService(
  repos: { comments: CommentRepository; issues: IssueRepository },
  now: () => number
): CommentService {
  const listComments = (issueId: string): Comment[] => {
    const issue = repos.issues.getById(issueId);
    if (!issue) {
      throw notFoundError('Issue not found', { issueId });
    }
    return repos.comments.listByIssue(issueId);
  };

  const createComment = (issueId: string, input: CreateCommentInput): Comment => {
    const issue = repos.issues.getById(issueId);
    if (!issue) {
      throw notFoundError('Issue not found', { issueId });
    }

    const timestamp = now();
    const comment: Comment = {
      id: randomUUID(),
      issueId,
      content: input.content,
      authorType: input.authorType,
      authorName: input.authorName,
      parentId: input.parentId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return repos.comments.create(comment);
  };

  return { listComments, createComment };
}
