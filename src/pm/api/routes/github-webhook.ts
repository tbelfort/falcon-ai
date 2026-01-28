import crypto from 'node:crypto';
import { Router, json } from 'express';
import type { Request } from 'express';
import type { PmRepos } from '../../core/repos/index.js';
import { createError } from '../../core/errors.js';
import { unixSeconds } from '../../core/utils/time.js';
import { parseRepoUrl } from '../../github/repo.js';
import { sendError } from '../http-errors.js';
import { sendSuccess } from '../response.js';

// Extend Request to include rawBody captured by verify callback
interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

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

/**
 * Verifies the GitHub webhook signature using HMAC-SHA256.
 * Returns true if signature is valid, false otherwise.
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const expectedSig = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

/**
 * Track processed webhook delivery IDs to prevent replay attacks.
 * Uses a time-bounded cache that auto-expires entries after 5 minutes.
 */
const processedDeliveries = new Map<string, number>();
const DELIVERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isReplayAttack(deliveryId: string | undefined): boolean {
  if (!deliveryId) {
    return false; // Allow if no delivery ID (backwards compatibility)
  }

  // Clean up expired entries
  const now = Date.now();
  for (const [id, timestamp] of processedDeliveries) {
    if (now - timestamp > DELIVERY_CACHE_TTL_MS) {
      processedDeliveries.delete(id);
    }
  }

  if (processedDeliveries.has(deliveryId)) {
    return true;
  }

  processedDeliveries.set(deliveryId, now);
  return false;
}

export interface GitHubWebhookOptions {
  repos: Pick<PmRepos, 'projects' | 'issues'>;
  webhookSecret?: string;
}

export function createGitHubWebhookRouter(
  reposOrOptions: Pick<PmRepos, 'projects' | 'issues'> | GitHubWebhookOptions
) {
  const router = Router();

  // Support both old signature (repos) and new signature (options)
  const options: GitHubWebhookOptions =
    'repos' in reposOrOptions ? reposOrOptions : { repos: reposOrOptions };
  const repos = options.repos;
  const webhookSecret = options.webhookSecret ?? process.env.GITHUB_WEBHOOK_SECRET;

  // Use custom JSON parser that captures raw body for signature verification
  router.use(
    json({
      verify: (req: WebhookRequest, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  router.post('/', (req: WebhookRequest, res) => {
    // Verify webhook signature - required when secret is configured
    if (webhookSecret) {
      const signature = req.header('x-hub-signature-256');
      // Use the captured raw body for signature verification
      const rawBody = req.rawBody?.toString('utf8') ?? '';
      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        return sendError(res, createError('VALIDATION_ERROR', 'Invalid webhook signature'));
      }
    }

    // Check for replay attacks
    const deliveryId = req.header('x-github-delivery');
    if (isReplayAttack(deliveryId)) {
      return sendSuccess(res, { ok: true }); // Acknowledge but don't process
    }

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
