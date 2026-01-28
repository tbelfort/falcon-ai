import type { Octokit } from '@octokit/rest';
import { parseRepoUrl } from './repo.js';

export interface PullRequestStatusInput {
  octokit: Octokit;
  repoUrl: string;
  prNumber: number;
}

export interface PullRequestStatus {
  isApproved: boolean;
  isMergeable: boolean;
  mergeableState: string | null;
  reviewDecision: string | null;
}

/**
 * Parse a review timestamp, returning 0 for null/undefined/invalid dates.
 * This ensures sort stability even if GitHub returns malformed timestamps.
 */
function parseReviewTimestamp(timestamp: string | null | undefined): number {
  if (!timestamp) {
    return 0;
  }
  const time = new Date(timestamp).getTime();
  // NaN check: invalid dates return NaN, which breaks sort comparisons
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Check if a pull request is approved and mergeable.
 * Uses GitHub's review decision from the GraphQL API via REST approximation.
 */
export async function getPullRequestStatus(input: PullRequestStatusInput): Promise<PullRequestStatus> {
  const { owner, repo } = parseRepoUrl(input.repoUrl);

  // Get PR details including mergeable status
  const { data: pr } = await input.octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: input.prNumber,
  });

  // Get reviews to determine approval status
  const { data: reviews } = await input.octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: input.prNumber,
  });

  // Sort reviews by submitted_at to ensure we process them in chronological order
  // This guarantees that later reviews overwrite earlier ones correctly
  const sortedReviews = [...reviews].sort((a, b) => {
    const timeA = parseReviewTimestamp(a.submitted_at);
    const timeB = parseReviewTimestamp(b.submitted_at);
    return timeA - timeB;
  });

  // Find the latest review from each reviewer (only the most recent counts)
  const latestReviewByUser = new Map<number, string>();
  for (const review of sortedReviews) {
    if (review.user?.id && review.state) {
      // Only consider reviews that make a decision (not COMMENTED or PENDING)
      if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) {
        latestReviewByUser.set(review.user.id, review.state);
      }
    }
  }

  // PR is approved if at least one approving review and no changes requested
  const reviewStates = Array.from(latestReviewByUser.values());
  const hasApproval = reviewStates.includes('APPROVED');
  const hasChangesRequested = reviewStates.includes('CHANGES_REQUESTED');
  const isApproved = hasApproval && !hasChangesRequested;

  return {
    isApproved,
    isMergeable: pr.mergeable ?? false,
    mergeableState: pr.mergeable_state ?? null,
    reviewDecision: isApproved ? 'APPROVED' : hasChangesRequested ? 'CHANGES_REQUESTED' : null,
  };
}
