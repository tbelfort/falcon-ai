import { Router } from 'express';
import type { PmRepos } from '../../core/repos/index.js';
import { unixSeconds } from '../../core/utils/time.js';
import { parseRepoUrl } from '../../github/repo.js';
import { sendSuccess } from '../response.js';

interface PullRequestWebhookPayload {
  repository?: {
    html_url?: string;
  };
  pull_request?: {
    number?: number;
    html_url?: string;
    head?: {
      ref?: string;
    };
  };
}

function repoMatches(projectRepoUrl: string | null, webhookRepoUrl: string): boolean {
  if (!projectRepoUrl) {
    return false;
  }
  try {
    const project = parseRepoUrl(projectRepoUrl);
    const webhook = parseRepoUrl(webhookRepoUrl);
    return project.owner === webhook.owner && project.repo === webhook.repo;
  } catch {
    return false;
  }
}

export function createGitHubWebhookRouter(repos: Pick<PmRepos, 'projects' | 'issues'>) {
  const router = Router();

  router.post('/', (req, res) => {
    const event = req.header('x-github-event');
    if (event !== 'pull_request') {
      return sendSuccess(res, { ok: true });
    }

    const payload = req.body as PullRequestWebhookPayload;
    const repoUrl = payload.repository?.html_url;
    const prNumber = payload.pull_request?.number;
    const prUrl = payload.pull_request?.html_url ?? null;
    const branchName = payload.pull_request?.head?.ref;

    if (!repoUrl || !prNumber || !branchName) {
      return sendSuccess(res, { ok: true });
    }

    const project = repos.projects.list().find((item) => repoMatches(item.repoUrl, repoUrl));
    if (!project) {
      return sendSuccess(res, { ok: true });
    }

    const issues = repos.issues.listByProject(project.id);
    const issue = issues.find(
      (item) => item.prNumber === prNumber || item.branchName === branchName
    );
    if (!issue) {
      return sendSuccess(res, { ok: true });
    }

    repos.issues.update(issue.id, {
      prNumber,
      prUrl: prUrl ?? issue.prUrl,
      updatedAt: unixSeconds(),
    });

    return sendSuccess(res, { ok: true });
  });

  return router;
}
