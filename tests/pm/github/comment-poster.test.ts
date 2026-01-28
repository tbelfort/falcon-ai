import { describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { upsertBotComment } from '../../../src/pm/github/comment-poster.js';

describe('upsertBotComment', () => {
  it('updates an existing bot comment when present', async () => {
    const listComments = vi.fn().mockResolvedValue({
      data: [{ id: 9, body: '<!-- falcon-bot:pr-review-summary -->\nOld' }],
    });
    const updateComment = vi.fn().mockResolvedValue({ data: {} });
    const createComment = vi.fn().mockResolvedValue({ data: {} });

    const octokit = {
      rest: {
        issues: {
          listComments,
          updateComment,
          createComment,
        },
      },
    } as unknown as Octokit;

    await upsertBotComment({
      octokit,
      repoUrl: 'acme/rocket',
      issueNumber: 5,
      identifier: 'pr-review-summary',
      body: 'Updated findings',
    });

    expect(updateComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'rocket',
      comment_id: 9,
      body: '<!-- falcon-bot:pr-review-summary -->\nUpdated findings',
    });
    expect(createComment).not.toHaveBeenCalled();
  });

  it('creates a new bot comment when none exists', async () => {
    const listComments = vi.fn().mockResolvedValue({ data: [] });
    const updateComment = vi.fn().mockResolvedValue({ data: {} });
    const createComment = vi.fn().mockResolvedValue({ data: {} });

    const octokit = {
      rest: {
        issues: {
          listComments,
          updateComment,
          createComment,
        },
      },
    } as unknown as Octokit;

    await upsertBotComment({
      octokit,
      repoUrl: 'https://github.com/acme/rocket',
      issueNumber: 7,
      identifier: 'pr-review-summary',
      body: 'New findings',
    });

    expect(createComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'rocket',
      issue_number: 7,
      body: '<!-- falcon-bot:pr-review-summary -->\nNew findings',
    });
    expect(updateComment).not.toHaveBeenCalled();
  });
});
