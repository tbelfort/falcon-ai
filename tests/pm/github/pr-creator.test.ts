import { describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { createPullRequest } from '../../../src/pm/github/pr-creator.js';

describe('createPullRequest', () => {
  it('creates a PR with the expected payload', async () => {
    const create = vi.fn().mockResolvedValue({
      data: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42' },
    });

    const octokit = {
      rest: {
        pulls: { create },
      },
    } as unknown as Octokit;

    const result = await createPullRequest({
      octokit,
      repoUrl: 'https://github.com/acme/rocket',
      title: 'Launch sequence',
      body: 'Automated PR',
      branchName: 'feature/launch',
      defaultBranch: 'main',
    });

    expect(create).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'rocket',
      title: 'Launch sequence',
      body: 'Automated PR',
      head: 'feature/launch',
      base: 'main',
      draft: false,
    });
    expect(result).toEqual({ number: 42, url: 'https://github.com/acme/rocket/pull/42' });
  });
});
