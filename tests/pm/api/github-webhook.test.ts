import { describe, expect, it, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import type { PmRepos } from '../../../src/pm/core/repos/index.js';
import { createGitHubWebhookRouter } from '../../../src/pm/api/routes/github-webhook.js';

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

function createApp(repos: Pick<PmRepos, 'projects' | 'issues'>, webhookSecret?: string) {
  const app = express();
  app.use(express.json());
  app.use('/webhook', createGitHubWebhookRouter({ repos, webhookSecret }));
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

  describe('signature verification', () => {
    const webhookSecret = 'test-secret-123';

    it('rejects requests with invalid signature when secret is configured', async () => {
      const app = createApp(repos, webhookSecret);
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

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { ok: false, error: 'Invalid signature' } });
      expect(repos.issues.update).not.toHaveBeenCalled();
    });

    it('rejects requests without signature when secret is configured', async () => {
      const app = createApp(repos, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('x-github-event', 'pull_request')
        .send({
          repository: { html_url: 'https://github.com/acme/rocket' },
          pull_request: { number: 42, html_url: 'https://github.com/acme/rocket/pull/42', head: { ref: 'feature/test' } },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { ok: false, error: 'Invalid signature' } });
    });

    it('accepts requests with valid signature', async () => {
      const app = createApp(repos, webhookSecret);
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
