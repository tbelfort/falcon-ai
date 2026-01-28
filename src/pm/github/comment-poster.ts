import type { Octokit } from '@octokit/rest';
import { parseRepoUrl } from './repo.js';

export interface UpsertBotCommentInput {
  octokit: Octokit;
  repoUrl: string;
  issueNumber: number;
  identifier: string;
  body: string;
}

export async function upsertBotComment(input: UpsertBotCommentInput): Promise<void> {
  const { owner, repo } = parseRepoUrl(input.repoUrl);
  const marker = `<!-- falcon-bot:${input.identifier} -->`;
  const fullBody = `${marker}\n${input.body}`;

  // Paginate through all comments to find existing bot comment
  let page = 1;
  const perPage = 100;
  let existingComment: { id: number } | undefined;

  while (!existingComment) {
    const { data: comments } = await input.octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: input.issueNumber,
      per_page: perPage,
      page,
    });

    existingComment = comments.find((comment: { body?: string | null; id: number }) =>
      (comment.body ?? '').includes(marker)
    );

    // If we found a comment or there are no more pages, stop searching
    if (existingComment || comments.length < perPage) {
      break;
    }

    page++;
  }

  if (existingComment) {
    await input.octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body: fullBody,
    });
    return;
  }

  await input.octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: input.issueNumber,
    body: fullBody,
  });
}
