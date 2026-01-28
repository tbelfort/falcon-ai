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

  const { data: comments } = await input.octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: input.issueNumber,
    per_page: 100,
  });

  const existing = comments.find((comment: { body?: string | null; id: number }) =>
    (comment.body ?? '').includes(marker)
  );
  if (existing) {
    await input.octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
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
