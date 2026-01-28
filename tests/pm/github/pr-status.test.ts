import { describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { getPullRequestStatus } from '../../../src/pm/github/pr-status.js';

function createMockOctokit(prData: object, reviews: object[]) {
  return {
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({ data: prData }),
        listReviews: vi.fn().mockResolvedValue({ data: reviews }),
      },
    },
  } as unknown as Octokit;
}

describe('getPullRequestStatus', () => {
  const defaultPrData = {
    mergeable: true,
    mergeable_state: 'clean',
  };

  describe('approval logic', () => {
    it('returns isApproved: true when at least one APPROVED review exists', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'https://github.com/acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(true);
      expect(result.reviewDecision).toBe('APPROVED');
    });

    it('returns isApproved: false when CHANGES_REQUESTED exists (different user)', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(false);
      expect(result.reviewDecision).toBe('CHANGES_REQUESTED');
    });

    it('returns isApproved: false when no reviews exist', async () => {
      const octokit = createMockOctokit(defaultPrData, []);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(false);
      expect(result.reviewDecision).toBe(null);
    });

    it('returns isApproved: false when only CHANGES_REQUESTED exists (no approvals)', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-01T00:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(false);
      expect(result.reviewDecision).toBe('CHANGES_REQUESTED');
    });
  });

  describe('latest review per user (chronological sorting)', () => {
    it('uses latest review when same user approves then requests changes', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 1 }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(false);
      expect(result.reviewDecision).toBe('CHANGES_REQUESTED');
    });

    it('uses latest review when same user requests changes then approves', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(true);
      expect(result.reviewDecision).toBe('APPROVED');
    });

    it('handles reviews returned in non-chronological order (API quirk)', async () => {
      // API returns in wrong order - later review first
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
        { user: { id: 1 }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-01T00:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      // Should use the later APPROVED review, not the earlier CHANGES_REQUESTED
      expect(result.isApproved).toBe(true);
    });
  });

  describe('review state filtering', () => {
    it('ignores COMMENTED reviews', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'COMMENTED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(true);
    });

    it('ignores PENDING reviews', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'PENDING', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(true);
    });

    it('only COMMENTED/PENDING reviews results in not approved', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'COMMENTED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'PENDING', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(false);
      expect(result.reviewDecision).toBe(null);
    });
  });

  describe('DISMISSED state handling', () => {
    it('DISMISSED clears previous state from same user', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 1 }, state: 'DISMISSED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      // DISMISSED replaces APPROVED, leaving no effective approval
      expect(result.isApproved).toBe(false);
    });

    it('DISMISSED does not block approval from another user', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'DISMISSED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(true);
    });
  });

  describe('null/undefined handling', () => {
    it('skips reviews with null user.id', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: null, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(true);
    });

    it('skips reviews with undefined user', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(true);
    });

    it('skips reviews with null state', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: null, submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(true);
    });

    it('handles reviews without submitted_at (uses 0 as fallback)', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'CHANGES_REQUESTED' }, // No submitted_at
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      // Review with submitted_at should be considered later than one without
      expect(result.isApproved).toBe(true);
    });
  });

  describe('mergeable status', () => {
    it('returns isMergeable: true when PR is mergeable', async () => {
      const octokit = createMockOctokit({ mergeable: true, mergeable_state: 'clean' }, []);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isMergeable).toBe(true);
      expect(result.mergeableState).toBe('clean');
    });

    it('returns isMergeable: false when PR has conflicts', async () => {
      const octokit = createMockOctokit({ mergeable: false, mergeable_state: 'dirty' }, []);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isMergeable).toBe(false);
      expect(result.mergeableState).toBe('dirty');
    });

    it('returns isMergeable: false when mergeable is null', async () => {
      const octokit = createMockOctokit({ mergeable: null, mergeable_state: 'unknown' }, []);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isMergeable).toBe(false);
      expect(result.mergeableState).toBe('unknown');
    });

    it('handles missing mergeable_state', async () => {
      const octokit = createMockOctokit({ mergeable: true }, []);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isMergeable).toBe(true);
      expect(result.mergeableState).toBe(null);
    });
  });

  describe('complex scenarios', () => {
    it('handles multiple reviewers with mixed states', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'COMMENTED', submitted_at: '2024-01-01T01:00:00Z' },
        { user: { id: 3 }, state: 'APPROVED', submitted_at: '2024-01-01T02:00:00Z' },
        { user: { id: 1 }, state: 'COMMENTED', submitted_at: '2024-01-01T03:00:00Z' }, // Comment doesn't change approval
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      // User 1's APPROVED still counts (COMMENTED doesn't override it)
      expect(result.isApproved).toBe(true);
    });

    it('single blocking review blocks all approvals', async () => {
      const octokit = createMockOctokit(defaultPrData, [
        { user: { id: 1 }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
        { user: { id: 2 }, state: 'APPROVED', submitted_at: '2024-01-01T01:00:00Z' },
        { user: { id: 3 }, state: 'APPROVED', submitted_at: '2024-01-01T02:00:00Z' },
        { user: { id: 4 }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-01T03:00:00Z' },
      ]);

      const result = await getPullRequestStatus({
        octokit,
        repoUrl: 'acme/rocket',
        prNumber: 123,
      });

      expect(result.isApproved).toBe(false);
    });
  });
});
