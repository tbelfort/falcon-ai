import { describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { GitHubMergeError, mergePullRequest } from '../../../src/pm/github/merger.js';

describe('mergePullRequest', () => {
  it('merges a PR with the expected payload', async () => {
    const merge = vi.fn().mockResolvedValue({ data: { merged: true, message: 'Merged' } });
    const octokit = {
      rest: {
        pulls: { merge },
      },
    } as unknown as Octokit;

    await mergePullRequest({
      octokit,
      repoUrl: 'git@github.com:acme/rocket.git',
      prNumber: 11,
    });

    expect(merge).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'rocket',
      pull_number: 11,
      merge_method: 'squash',
    });
  });

  it('throws a typed error when merge fails', async () => {
    const merge = vi.fn().mockResolvedValue({
      data: { merged: false, message: 'Merge conflict' },
    });
    const octokit = {
      rest: {
        pulls: { merge },
      },
    } as unknown as Octokit;

    await expect(
      mergePullRequest({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 12,
      })
    ).rejects.toBeInstanceOf(GitHubMergeError);
  });
});
