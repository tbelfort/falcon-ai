import type { CommentRepo, CommentCreateInput } from '../../core/repos/comments.js';
import type { CommentDto } from '../../contracts/http.js';

export class DbCommentsRepo implements CommentRepo {
  listByIssue(_issueId: string): CommentDto[] {
    throw new Error('DbCommentsRepo.listByIssue not implemented');
  }

  create(_input: CommentCreateInput): CommentDto {
    throw new Error('DbCommentsRepo.create not implemented');
  }
}
