import type { CommentDto } from '../../contracts/http.js';

export interface CommentCreateInput {
  id: string;
  issueId: string;
  content: string;
  authorType: 'agent' | 'human';
  authorName: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CommentRepo {
  listByIssue(issueId: string): CommentDto[];
  create(input: CommentCreateInput): CommentDto;
}
