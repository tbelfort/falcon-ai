import type { Octokit } from '@octokit/rest';
import { parseRepoUrl } from './repo.js';

export class GitHubMergeError extends Error {
  constructor(message = 'GitHub merge failed') {
    super(message);
    this.name = 'GitHubMergeError';
  }
}

export interface MergePullRequestInput {
  octokit: Octokit;
  repoUrl: string;
  prNumber: number;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}

export async function mergePullRequest(input: MergePullRequestInput): Promise<void> {
  const { owner, repo } = parseRepoUrl(input.repoUrl);
  const { data } = await input.octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: input.prNumber,
    merge_method: input.mergeMethod ?? 'squash',
  });

  if (!data.merged) {
    throw new GitHubMergeError(data.message ?? 'GitHub merge failed');
  }
}
