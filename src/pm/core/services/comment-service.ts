import type { Comment } from '../types.js';
import type { ICommentRepo, IIssueRepo } from '../repos/interfaces.js';
import type { AuthorType, CommentDto } from '../../contracts/http.js';

export interface CreateCommentInput {
  content: string;
  authorType: AuthorType;
  authorName: string;
  parentId?: string | null;
}

export type CommentServiceError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'VALIDATION_ERROR'; message: string; details?: unknown };

export type CommentResult<T> = { ok: true; value: T } | { ok: false; error: CommentServiceError };

function toDto(comment: Comment): CommentDto {
  return {
    id: comment.id,
    issueId: comment.issueId,
    content: comment.content,
    authorType: comment.authorType as AuthorType,
    authorName: comment.authorName,
    parentId: comment.parentId,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

export class CommentService {
  constructor(
    private readonly commentRepo: ICommentRepo,
    private readonly issueRepo: IIssueRepo
  ) {}

  async list(issueId: string): Promise<CommentResult<CommentDto[]>> {
    // Validate issue exists
    const issue = await this.issueRepo.findById(issueId);
    if (!issue) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Issue ${issueId} not found` },
      };
    }

    const comments = await this.commentRepo.findByIssue(issueId);
    return { ok: true, value: comments.map(toDto) };
  }

  async get(id: string): Promise<CommentResult<CommentDto>> {
    const comment = await this.commentRepo.findById(id);
    if (!comment) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Comment ${id} not found` } };
    }
    return { ok: true, value: toDto(comment) };
  }

  async create(issueId: string, input: CreateCommentInput): Promise<CommentResult<CommentDto>> {
    // Validate issue exists
    const issue = await this.issueRepo.findById(issueId);
    if (!issue) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Issue ${issueId} not found` },
      };
    }

    // Validate content
    if (!input.content || input.content.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Content is required' },
      };
    }

    // Validate authorType
    const validAuthorTypes: AuthorType[] = ['agent', 'human'];
    if (!validAuthorTypes.includes(input.authorType)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid authorType: ${input.authorType}` },
      };
    }

    // Validate authorName
    if (!input.authorName || input.authorName.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Author name is required' },
      };
    }

    // Validate parent comment exists if provided
    if (input.parentId) {
      const parent = await this.commentRepo.findById(input.parentId);
      if (!parent) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: `Parent comment ${input.parentId} not found` },
        };
      }
      if (parent.issueId !== issueId) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Parent comment belongs to a different issue' },
        };
      }
    }

    const comment = await this.commentRepo.create({
      issueId,
      content: input.content.trim(),
      authorType: input.authorType,
      authorName: input.authorName.trim(),
      parentId: input.parentId ?? null,
    });

    return { ok: true, value: toDto(comment) };
  }
}
