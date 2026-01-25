import type { CommentRecord, CommentRepo } from '../../core/repos/index.js';

export class DbCommentRepo implements CommentRepo {
  async listByIssue(): Promise<CommentRecord[]> {
    throw new Error('DbCommentRepo not implemented in Phase 1.');
  }

  async create(): Promise<CommentRecord> {
    throw new Error('DbCommentRepo not implemented in Phase 1.');
  }
}
