import type { CommentRepo, IssueRepo } from '../repos/index.js';

export class CommentsService {
  constructor(
    private issues: IssueRepo,
    private comments: CommentRepo
  ) {}

  async getIssueComments(issueId: string) {
    const issue = await this.issues.findById(issueId);
    if (!issue) {
      throw new Error('NOT_FOUND');
    }
    const comments = await this.comments.findByIssueId(issueId);
    return {
      data: comments,
    };
  }

  async getComment(id: string) {
    const comment = await this.comments.findById(id);
    if (!comment) {
      throw new Error('NOT_FOUND');
    }
    return {
      data: comment,
    };
  }

  async createComment(data: {
    issueId: string;
    content: string;
    authorType: string;
    authorName: string;
    parentId?: string;
  }) {
    const issue = await this.issues.findById(data.issueId);
    if (!issue) {
      throw new Error('NOT_FOUND');
    }
    const comment = await this.comments.create({
      issueId: data.issueId,
      content: data.content,
      authorType: data.authorType,
      authorName: data.authorName,
      parentId: data.parentId ?? null,
    });
    return {
      data: comment,
    };
  }

  async deleteComment(id: string) {
    const existing = await this.comments.findById(id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    await this.comments.delete(id);
    return {
      data: existing,
    };
  }
}