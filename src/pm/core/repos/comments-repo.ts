import type { Comment } from '../types.js';

export interface CommentRepository {
  listByIssue(issueId: string): Comment[];
  create(comment: Comment): Comment;
}
