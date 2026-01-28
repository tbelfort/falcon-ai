import type { Octokit } from '@octokit/rest';
import { parseRepoUrl } from './repo.js';

export interface CreatePullRequestInput {
  octokit: Octokit;
  repoUrl: string;
  title: string;
  body: string;
  branchName: string;
  defaultBranch: string;
}

export interface PullRequestInfo {
  number: number;
  url: string;
}

export async function createPullRequest(
  input: CreatePullRequestInput
): Promise<PullRequestInfo> {
  const { owner, repo } = parseRepoUrl(input.repoUrl);
  const { data: pr } = await input.octokit.rest.pulls.create({
    owner,
    repo,
    title: input.title,
    body: input.body,
    head: input.branchName,
    base: input.defaultBranch,
    draft: false,
  });

  return { number: pr.number, url: pr.html_url };
}
