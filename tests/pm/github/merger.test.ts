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
    ).rejects.toThrow('Merge conflict');
  });

  it('throws GitHubMergeError with default message when API returns no message', async () => {
    const merge = vi.fn().mockResolvedValue({
      data: { merged: false, message: null },
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
    ).rejects.toThrow('GitHub merge failed');
  });

  it('propagates Octokit errors', async () => {
    const merge = vi.fn().mockRejectedValue(new Error('Network timeout'));
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
    ).rejects.toThrow('Network timeout');
  });

  it('supports custom merge method', async () => {
    const merge = vi.fn().mockResolvedValue({ data: { merged: true, message: 'Merged' } });
    const octokit = {
      rest: {
        pulls: { merge },
      },
    } as unknown as Octokit;

    await mergePullRequest({
      octokit,
      repoUrl: 'acme/rocket',
      prNumber: 11,
      mergeMethod: 'rebase',
    });

    expect(merge).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'rocket',
      pull_number: 11,
      merge_method: 'rebase',
    });
  });
});
