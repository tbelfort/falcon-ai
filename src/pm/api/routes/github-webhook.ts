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

/** Exported for testing */
export function repoMatches(projectRepoUrl: string | null, webhookRepoUrl: string): boolean {
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
 * Cache is capped at MAX_DELIVERY_CACHE_SIZE with LRU eviction.
 */
const processedDeliveries = new Map<string, number>();
export const DELIVERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_DELIVERY_CACHE_SIZE = 10000; // Max entries to prevent memory exhaustion

/**
 * Check if a delivery ID represents a replay attack.
 * Also performs TTL cleanup and LRU eviction when cache is at capacity.
 */
export function isReplayAttack(deliveryId: string | undefined): boolean {
  if (!deliveryId) {
    return false; // Allow if no delivery ID (backwards compatibility)
  }

  // Clean up expired entries first
  const now = Date.now();
  for (const [id, timestamp] of processedDeliveries) {
    if (now - timestamp > DELIVERY_CACHE_TTL_MS) {
      processedDeliveries.delete(id);
    }
  }

  if (processedDeliveries.has(deliveryId)) {
    return true;
  }

  // LRU eviction if cache is at capacity - remove oldest entries
  if (processedDeliveries.size >= MAX_DELIVERY_CACHE_SIZE) {
    // Find and remove oldest entries (first 10% of capacity to avoid frequent eviction)
    const entriesToRemove = Math.max(1, Math.floor(MAX_DELIVERY_CACHE_SIZE * 0.1));
    const entries = Array.from(processedDeliveries.entries())
      .sort((a, b) => a[1] - b[1]); // Sort by timestamp ascending (oldest first)

    for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
      processedDeliveries.delete(entries[i][0]);
    }
  }

  processedDeliveries.set(deliveryId, now);
  return false;
}

/** Clear the delivery cache (for testing) */
export function clearDeliveryCache(): void {
  processedDeliveries.clear();
}

/** Get the current cache size (for testing) */
export function getDeliveryCacheSize(): number {
  return processedDeliveries.size;
}

export interface GitHubWebhookOptions {
  repos: Pick<PmRepos, 'projects' | 'issues'>;
  webhookSecret?: string;
  /** If true, require webhook secret (reject webhooks if secret is not configured). Default: true */
  requireSecret?: boolean;
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
  const requireSecret = options.requireSecret ?? true; // Default to requiring secret for security

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
    } else if (requireSecret) {
      // Secret is required but not configured - reject for security
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Webhook secret not configured. Set GITHUB_WEBHOOK_SECRET environment variable.')
      );
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
    const rawPrNumber = payload.pull_request?.number;
    const prUrl = payload.pull_request?.html_url ?? null;
    const branchName = payload.pull_request?.head?.ref;

    // Validate prNumber is a positive integer (defense-in-depth beyond HMAC gate)
    const prNumber = typeof rawPrNumber === 'number' && Number.isInteger(rawPrNumber) && rawPrNumber > 0
      ? rawPrNumber
      : undefined;

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

    const updated = repos.issues.update(issue.id, {
      prNumber,
      prUrl: prUrl ?? issue.prUrl,
      updatedAt: unixSeconds(),
    });
    if (!updated) {
      console.warn(`github-webhook: issues.update returned null for issue ${issue.id}`);
    }

    return sendSuccess(res, { ok: true });
  });

  return router;
}
