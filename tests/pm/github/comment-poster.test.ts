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

  it('propagates Octokit errors from listComments', async () => {
    const listComments = vi.fn().mockRejectedValue(new Error('API rate limit exceeded'));
    const updateComment = vi.fn();
    const createComment = vi.fn();

    const octokit = {
      rest: {
        issues: {
          listComments,
          updateComment,
          createComment,
        },
      },
    } as unknown as Octokit;

    await expect(
      upsertBotComment({
        octokit,
        repoUrl: 'acme/rocket',
        issueNumber: 5,
        identifier: 'pr-review-summary',
        body: 'Test',
      })
    ).rejects.toThrow('API rate limit exceeded');
  });

  it('propagates Octokit errors from createComment', async () => {
    const listComments = vi.fn().mockResolvedValue({ data: [] });
    const updateComment = vi.fn();
    const createComment = vi.fn().mockRejectedValue(new Error('Permission denied'));

    const octokit = {
      rest: {
        issues: {
          listComments,
          updateComment,
          createComment,
        },
      },
    } as unknown as Octokit;

    await expect(
      upsertBotComment({
        octokit,
        repoUrl: 'acme/rocket',
        issueNumber: 5,
        identifier: 'pr-review-summary',
        body: 'Test',
      })
    ).rejects.toThrow('Permission denied');
  });

  it('propagates Octokit errors from updateComment', async () => {
    const listComments = vi.fn().mockResolvedValue({
      data: [{ id: 9, body: '<!-- falcon-bot:pr-review-summary -->\nOld' }],
    });
    const updateComment = vi.fn().mockRejectedValue(new Error('Comment not found'));
    const createComment = vi.fn();

    const octokit = {
      rest: {
        issues: {
          listComments,
          updateComment,
          createComment,
        },
      },
    } as unknown as Octokit;

    await expect(
      upsertBotComment({
        octokit,
        repoUrl: 'acme/rocket',
        issueNumber: 5,
        identifier: 'pr-review-summary',
        body: 'Updated',
      })
    ).rejects.toThrow('Comment not found');
  });

  it('paginates through comments to find existing bot comment on page 2', async () => {
    // First page: 100 comments, none matching
    const page1Comments = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      body: `Comment ${i + 1}`,
    }));

    // Second page: bot comment is here
    const page2Comments = [
      { id: 101, body: '<!-- falcon-bot:pr-review-summary -->\nExisting' },
      { id: 102, body: 'Another comment' },
    ];

    const listComments = vi
      .fn()
      .mockResolvedValueOnce({ data: page1Comments })
      .mockResolvedValueOnce({ data: page2Comments });
    const updateComment = vi.fn().mockResolvedValue({ data: {} });
    const createComment = vi.fn();

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
      body: 'Updated on page 2',
    });

    expect(listComments).toHaveBeenCalledTimes(2);
    expect(listComments).toHaveBeenNthCalledWith(1, {
      owner: 'acme',
      repo: 'rocket',
      issue_number: 5,
      per_page: 100,
      page: 1,
    });
    expect(listComments).toHaveBeenNthCalledWith(2, {
      owner: 'acme',
      repo: 'rocket',
      issue_number: 5,
      per_page: 100,
      page: 2,
    });
    expect(updateComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'rocket',
      comment_id: 101,
      body: '<!-- falcon-bot:pr-review-summary -->\nUpdated on page 2',
    });
    expect(createComment).not.toHaveBeenCalled();
  });

  it('stops pagination when fewer than per_page comments returned', async () => {
    // Page with fewer than 100 comments - indicates last page
    const comments = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      body: `Comment ${i + 1}`,
    }));

    const listComments = vi.fn().mockResolvedValue({ data: comments });
    const createComment = vi.fn().mockResolvedValue({ data: {} });
    const updateComment = vi.fn();

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
      body: 'New comment',
    });

    // Should only call listComments once since < 100 comments returned
    expect(listComments).toHaveBeenCalledTimes(1);
    expect(createComment).toHaveBeenCalled();
    expect(updateComment).not.toHaveBeenCalled();
  });
});
