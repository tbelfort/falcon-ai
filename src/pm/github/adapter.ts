import type { Octokit } from '@octokit/rest';
import { createOctokitFromEnv } from './client.js';
import type { CreatePullRequestInput, PullRequestInfo } from './pr-creator.js';
import { createPullRequest } from './pr-creator.js';
import type { UpsertBotCommentInput } from './comment-poster.js';
import { upsertBotComment } from './comment-poster.js';
import type { MergePullRequestInput } from './merger.js';
import { mergePullRequest } from './merger.js';

export interface GitHubAdapter {
  createPullRequest(
    input: Omit<CreatePullRequestInput, 'octokit'>
  ): Promise<PullRequestInfo>;
  upsertBotComment(input: Omit<UpsertBotCommentInput, 'octokit'>): Promise<void>;
  mergePullRequest(input: Omit<MergePullRequestInput, 'octokit'>): Promise<void>;
}

export class OctokitGitHubAdapter implements GitHubAdapter {
  constructor(private readonly octokit: Octokit) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): OctokitGitHubAdapter {
    return new OctokitGitHubAdapter(createOctokitFromEnv(env));
  }

  async createPullRequest(
    input: Omit<CreatePullRequestInput, 'octokit'>
  ): Promise<PullRequestInfo> {
    return createPullRequest({ ...input, octokit: this.octokit });
  }

  async upsertBotComment(
    input: Omit<UpsertBotCommentInput, 'octokit'>
  ): Promise<void> {
    return upsertBotComment({ ...input, octokit: this.octokit });
  }

  async mergePullRequest(input: Omit<MergePullRequestInput, 'octokit'>): Promise<void> {
    return mergePullRequest({ ...input, octokit: this.octokit });
  }
}
