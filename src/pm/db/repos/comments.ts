import type { Comment } from '../../core/types.js';
import type { CommentRepository } from '../../core/repos/comments-repo.js';

export class DbCommentRepository implements CommentRepository {
  listByIssue(issueId: string): Comment[] {
    void issueId;
    throw new Error('DbCommentRepository not implemented');
  }

  create(comment: Comment): Comment {
    void comment;
    throw new Error('DbCommentRepository not implemented');
  }
}
