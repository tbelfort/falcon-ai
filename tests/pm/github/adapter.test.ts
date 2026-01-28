import { describe, expect, it, vi } from 'vitest';
import { OctokitGitHubAdapter } from '../../../src/pm/github/adapter.js';

vi.mock('../../../src/pm/github/pr-creator.js', () => ({
  createPullRequest: vi.fn().mockResolvedValue({ number: 1, url: 'https://github.com/test/repo/pull/1' }),
}));

vi.mock('../../../src/pm/github/comment-poster.js', () => ({
  upsertBotComment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/pm/github/merger.js', () => ({
  mergePullRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/pm/github/pr-status.js', () => ({
  getPullRequestStatus: vi.fn().mockResolvedValue({
    isApproved: true,
    isMergeable: true,
    mergeableState: 'clean',
    reviewDecision: 'APPROVED',
  }),
}));

describe('OctokitGitHubAdapter', () => {
  const mockOctokit = { rest: {} } as never;

  it('passes octokit to createPullRequest', async () => {
    const { createPullRequest } = await import('../../../src/pm/github/pr-creator.js');
    const adapter = new OctokitGitHubAdapter(mockOctokit);

    const input = {
      repoUrl: 'https://github.com/test/repo',
      title: 'Test PR',
      body: 'Test body',
      branchName: 'feature/test',
      defaultBranch: 'main',
    };

    await adapter.createPullRequest(input);

    expect(createPullRequest).toHaveBeenCalledWith({ ...input, octokit: mockOctokit });
  });

  it('passes octokit to upsertBotComment', async () => {
    const { upsertBotComment } = await import('../../../src/pm/github/comment-poster.js');
    const adapter = new OctokitGitHubAdapter(mockOctokit);

    const input = {
      repoUrl: 'https://github.com/test/repo',
      issueNumber: 1,
      identifier: 'test-id',
      body: 'Test comment',
    };

    await adapter.upsertBotComment(input);

    expect(upsertBotComment).toHaveBeenCalledWith({ ...input, octokit: mockOctokit });
  });

  it('passes octokit to mergePullRequest', async () => {
    const { mergePullRequest } = await import('../../../src/pm/github/merger.js');
    const adapter = new OctokitGitHubAdapter(mockOctokit);

    const input = {
      repoUrl: 'https://github.com/test/repo',
      prNumber: 1,
    };

    await adapter.mergePullRequest(input);

    expect(mergePullRequest).toHaveBeenCalledWith({ ...input, octokit: mockOctokit });
  });

  it('passes octokit to getPullRequestStatus', async () => {
    const { getPullRequestStatus } = await import('../../../src/pm/github/pr-status.js');
    const adapter = new OctokitGitHubAdapter(mockOctokit);

    const input = {
      repoUrl: 'https://github.com/test/repo',
      prNumber: 1,
    };

    await adapter.getPullRequestStatus(input);

    expect(getPullRequestStatus).toHaveBeenCalledWith({ ...input, octokit: mockOctokit });
  });
});
