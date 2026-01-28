import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import type { PmRepos } from '../../../src/pm/core/repos/index.js';
import {
  createGitHubWebhookRouter,
  isReplayAttack,
  clearDeliveryCache,
  getDeliveryCacheSize,
  repoMatches,
  DELIVERY_CACHE_TTL_MS,
  MAX_DELIVERY_CACHE_SIZE,
} from '../../../src/pm/api/routes/github-webhook.js';

function createMockRepos(): Pick<PmRepos, 'projects' | 'issues'> {
  return {
    projects: {
      list: vi.fn().mockReturnValue([
        { id: 'proj-1', repoUrl: 'https://github.com/acme/rocket' },
      ]),
      getById: vi.fn(),
      getBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as PmRepos['projects'],
    issues: {
      listByProject: vi.fn().mockReturnValue([
        { id: 'issue-1', prNumber: null, branchName: 'feature/test', prUrl: null },
      ]),
      update: vi.fn().mockReturnValue({ id: 'issue-1' }),
      getById: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      setLabels: vi.fn(),
      nextNumber: vi.fn(),
    } as unknown as PmRepos['issues'],
  };
}

function createApp(
  repos: Pick<PmRepos, 'projects' | 'issues'>,
  options?: { webhookSecret?: string; requireSecret?: boolean }
) {
  const app = express();
  // Note: Do NOT add express.json() here - the webhook router has its own JSON parser
  // that captures raw body for signature verification
  app.use(
    '/webhook',
    createGitHubWebhookRouter({
      repos,
      webhookSecret: options?.webhookSecret,
      requireSecret: options?.requireSecret ?? false,
    })
  );
  return app;
}

function signPayload(payload: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

describe('github-webhook', () => {
  let repos: ReturnType<typeof createMockRepos>;

  beforeEach(() => {
    repos = createMockRepos();
  });

  it('returns ok for non-pull_request events', async () => {
    const app = createApp(repos);
    const response = await request(app)
      .post('/webhook')
      .set('x-github-event', 'push')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
    expect(repos.issues.update).not.toHaveBeenCalled();
  });

  it('returns ok when required fields are missing', async () => {
    const app = createApp(repos);
    const response = await request(app)
      .post('/webhook')
      .set('x-github-event', 'pull_request')
      .send({ repository: {} }); // Missing required fields

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
    expect(repos.issues.update).not.toHaveBeenCalled();
  });

  it('returns ok when project not found', async () => {
    (repos.projects.list as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const app = createApp(repos);

    const response = await request(app)
      .post('/webhook')
      .set('x-github-event', 'pull_request')
      .send({
        repository: { html_url: 'https://github.com/unknown/repo' },
        pull_request: { number: 1, html_url: 'https://github.com/unknown/repo/pull/1', head: { ref: 'main' } },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
    expect(repos.issues.update).not.toHaveBeenCalled();
  });

  it('returns ok when issue not found', async () => {
    (repos.issues.listByProject as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const app = createApp(repos);

    const response = await request(app)
      .post('/webhook')
      .set('x-github-event', 'pull_request')
      .send({
        repository: { html_url: 'https://github.com/acme/rocket' },
        pull_request: { number: 999, html_url: 'https://github.com/acme/rocket/pull/999', head: { ref: 'unknown-branch' } },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
    expect(repos.issues.update).not.toHaveBeenCalled();
  });

  it('updates issue when matched by branchName', async () => {
    const app = createApp(repos);

    const response = await request(app)
      .post('/webhook')
      .set('x-github-event', 'pull_request')
      .send({
        repository: { html_url: 'https://github.com/acme/rocket' },
        pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
    expect(repos.issues.update).toHaveBeenCalledWith('issue-1', expect.objectContaining({
      prNumber: 42,
      prUrl: 'https://github.com/acme/rocket/pull/42',
    }));
  });

  it('matches issue by prNumber', async () => {
    (repos.issues.listByProject as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'issue-2', prNumber: 42, branchName: 'other-branch', prUrl: 'old-url' },
    ]);
    const app = createApp(repos);

    const response = await request(app)
      .post('/webhook')
      .set('x-github-event', 'pull_request')
      .send({
        repository: { html_url: 'https://github.com/acme/rocket' },
        pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'main' } },
      });

    expect(response.status).toBe(200);
    expect(repos.issues.update).toHaveBeenCalledWith('issue-2', expect.objectContaining({
      prNumber: 42,
    }));
  });

  it('preserves existing prUrl if webhook sends null', async () => {
    (repos.issues.listByProject as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'issue-3', prNumber: null, branchName: 'feature/test', prUrl: 'https://existing-url.com' },
    ]);
    const app = createApp(repos);

    const response = await request(app)
      .post('/webhook')
      .set('x-github-event', 'pull_request')
      .send({
        repository: { html_url: 'https://github.com/acme/rocket' },
        pull_request: { number: 42, html_url: null, head: { ref: 'feature/test' } },
      });

    expect(response.status).toBe(200);
    expect(repos.issues.update).toHaveBeenCalledWith('issue-3', expect.objectContaining({
      prNumber: 42,
      prUrl: 'https://existing-url.com',
    }));
  });

  describe('internal repo call validation', () => {
    it('returns 200 OK but logs warning when issues.update returns null', async () => {
      (repos.issues.update as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const app = createApp(repos);
      const response = await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .send({
          repository: { html_url: 'https://github.com/acme/rocket' },
          pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { ok: true } });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('github-webhook: issues.update returned null')
      );

      warnSpy.mockRestore();
    });
  });

  describe('signature verification', () => {
    const webhookSecret = 'test-secret-123';

    it('rejects requests with invalid signature when secret is configured', async () => {
      const app = createApp(repos, { webhookSecret, requireSecret: true });
      const payload = JSON.stringify({
        repository: { html_url: 'https://github.com/acme/rocket' },
        pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
      });

      const response = await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .set('x-hub-signature-256', 'sha256=invalid-signature')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook signature' } });
      expect(repos.issues.update).not.toHaveBeenCalled();
    });

    it('rejects requests without signature when secret is configured', async () => {
      const app = createApp(repos, { webhookSecret, requireSecret: true });
      const payload = JSON.stringify({
        repository: { html_url: 'https://github.com/acme/rocket' },
        pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
      });

      const response = await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook signature' } });
    });

    it('accepts requests with valid signature', async () => {
      const app = createApp(repos, { webhookSecret, requireSecret: true });
      const payload = JSON.stringify({
        repository: { html_url: 'https://github.com/acme/rocket' },
        pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
      });
      const signature = signPayload(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .set('x-hub-signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { ok: true } });
      expect(repos.issues.update).toHaveBeenCalled();
    });

    it('allows requests without signature when no secret is configured', async () => {
      const app = createApp(repos); // No secret

      const response = await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .send({
          repository: { html_url: 'https://github.com/acme/rocket' },
          pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { ok: true } });
      expect(repos.issues.update).toHaveBeenCalled();
    });
  });

  describe('replay attack prevention', () => {
    afterEach(() => {
      clearDeliveryCache();
    });

    it('processes same delivery ID only once', async () => {
      const app = createApp(repos);

      // First request
      await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'delivery-123')
        .send({
          repository: { html_url: 'https://github.com/acme/rocket' },
          pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
        });

      expect(repos.issues.update).toHaveBeenCalledTimes(1);

      // Second request with same delivery ID
      await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'delivery-123')
        .send({
          repository: { html_url: 'https://github.com/acme/rocket' },
          pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
        });

      // Should not process the second request
      expect(repos.issues.update).toHaveBeenCalledTimes(1);
    });

    it('processes requests with different delivery IDs', async () => {
      const app = createApp(repos);

      await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'delivery-1')
        .send({
          repository: { html_url: 'https://github.com/acme/rocket' },
          pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
        });

      await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'delivery-2')
        .send({
          repository: { html_url: 'https://github.com/acme/rocket' },
          pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
        });

      expect(repos.issues.update).toHaveBeenCalledTimes(2);
    });
  });
});

describe('isReplayAttack (unit tests)', () => {
  afterEach(() => {
    clearDeliveryCache();
    vi.useRealTimers();
  });

  it('returns false for first occurrence of delivery ID', () => {
    expect(isReplayAttack('delivery-new')).toBe(false);
  });

  it('returns true for duplicate delivery ID', () => {
    isReplayAttack('delivery-dup');
    expect(isReplayAttack('delivery-dup')).toBe(true);
  });

  it('returns false when delivery ID is undefined', () => {
    expect(isReplayAttack(undefined)).toBe(false);
  });

  describe('TTL cleanup', () => {
    it('cleans up expired entries and allows reprocessing', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      // First occurrence
      expect(isReplayAttack('delivery-ttl')).toBe(false);
      expect(getDeliveryCacheSize()).toBe(1);

      // Still within TTL
      vi.setSystemTime(now + DELIVERY_CACHE_TTL_MS - 1000);
      expect(isReplayAttack('delivery-ttl')).toBe(true);

      // Advance past TTL
      vi.setSystemTime(now + DELIVERY_CACHE_TTL_MS + 1000);

      // Should be cleaned up and allowed again
      expect(isReplayAttack('delivery-ttl')).toBe(false);
    });

    it('cleans up multiple expired entries', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      // Add several entries
      isReplayAttack('delivery-1');
      isReplayAttack('delivery-2');
      isReplayAttack('delivery-3');
      expect(getDeliveryCacheSize()).toBe(3);

      // Advance past TTL
      vi.setSystemTime(now + DELIVERY_CACHE_TTL_MS + 1000);

      // Trigger cleanup by calling isReplayAttack
      isReplayAttack('delivery-new');

      // Old entries should be cleaned, only new one remains
      expect(getDeliveryCacheSize()).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entries when cache reaches capacity', () => {
      vi.useFakeTimers();
      const baseTime = Date.now();

      // Fill cache to capacity
      for (let i = 0; i < MAX_DELIVERY_CACHE_SIZE; i++) {
        vi.setSystemTime(baseTime + i); // Each entry has slightly different timestamp
        isReplayAttack(`delivery-${i}`);
      }

      expect(getDeliveryCacheSize()).toBe(MAX_DELIVERY_CACHE_SIZE);

      // Add one more - should trigger LRU eviction
      vi.setSystemTime(baseTime + MAX_DELIVERY_CACHE_SIZE);
      const result = isReplayAttack('delivery-new');

      // New entry should be accepted (not treated as replay)
      expect(result).toBe(false);

      // Cache should have evicted some entries (10% of capacity)
      const expectedSize = MAX_DELIVERY_CACHE_SIZE - Math.floor(MAX_DELIVERY_CACHE_SIZE * 0.1) + 1;
      expect(getDeliveryCacheSize()).toBe(expectedSize);

      // Oldest entries should have been evicted
      expect(isReplayAttack('delivery-0')).toBe(false); // Can add again since evicted
    });

    it('continues processing new webhooks at capacity (no fail-closed)', () => {
      vi.useFakeTimers();
      const baseTime = Date.now();

      // Fill cache to capacity
      for (let i = 0; i < MAX_DELIVERY_CACHE_SIZE; i++) {
        vi.setSystemTime(baseTime + i);
        isReplayAttack(`delivery-${i}`);
      }

      // Add several new entries - all should be accepted
      for (let i = 0; i < 100; i++) {
        vi.setSystemTime(baseTime + MAX_DELIVERY_CACHE_SIZE + i);
        const result = isReplayAttack(`delivery-new-${i}`);
        expect(result).toBe(false); // Should NOT fail-closed
      }
    });
  });

  describe('repoMatches', () => {
    it('returns false for null project URL', () => {
      expect(repoMatches(null, 'https://github.com/acme/rocket')).toBe(false);
    });

    it('returns false for empty project URL', () => {
      expect(repoMatches('', 'https://github.com/acme/rocket')).toBe(false);
    });

    it('returns true for matching HTTPS URLs', () => {
      expect(
        repoMatches('https://github.com/acme/rocket', 'https://github.com/acme/rocket')
      ).toBe(true);
    });

    it('returns true for matching HTTPS URL with .git suffix', () => {
      expect(
        repoMatches('https://github.com/acme/rocket.git', 'https://github.com/acme/rocket')
      ).toBe(true);
    });

    it('returns true for matching SSH and HTTPS URLs (same owner/repo)', () => {
      expect(
        repoMatches('git@github.com:acme/rocket', 'https://github.com/acme/rocket')
      ).toBe(true);
    });

    it('returns false for different repos same owner', () => {
      expect(
        repoMatches('https://github.com/acme/rocket', 'https://github.com/acme/other')
      ).toBe(false);
    });

    it('returns false for same repo different owner', () => {
      expect(
        repoMatches('https://github.com/acme/rocket', 'https://github.com/other/rocket')
      ).toBe(false);
    });

    it('returns false for invalid project URL', () => {
      expect(repoMatches('not-a-url', 'https://github.com/acme/rocket')).toBe(false);
    });

    it('returns false for invalid webhook URL', () => {
      expect(repoMatches('https://github.com/acme/rocket', 'not-a-url')).toBe(false);
    });

    it('handles case sensitivity correctly (GitHub is case-insensitive)', () => {
      // Note: GitHub treats owner/repo as case-insensitive, but our regex is case-sensitive
      // This tests current behavior - owner/repo must match exactly
      expect(
        repoMatches('https://github.com/Acme/Rocket', 'https://github.com/acme/rocket')
      ).toBe(false);
    });
  });
});
