import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';

import { createApiApp } from '../../../src/pm/api/server.js';
import type { BroadcastFn } from '../../../src/pm/api/websocket.js';
import { createServices } from '../../../src/pm/core/services/index.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api documents', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    const repos = createInMemoryRepos();
    const services = createServices(repos, { now: () => 1_700_000_000 });
    const broadcast: BroadcastFn = () => undefined;
    app = createApiApp({ services, broadcast });
  });

  it('creates and lists documents per issue', async () => {
    const projectResponse = await request(app).post('/api/projects').send({
      name: 'Docs',
      slug: 'docs',
      description: null,
      repoUrl: null,
      defaultBranch: 'main',
    });
    const projectId = projectResponse.body.data.id;

    const issueResponse = await request(app).post('/api/issues').send({
      projectId,
      title: 'Docs issue',
      description: null,
      priority: 'low',
    });
    const issueId = issueResponse.body.data.id;

    const createResponse = await request(app)
      .post(`/api/issues/${issueId}/documents`)
      .send({
        title: 'Context pack',
        docType: 'context_pack',
        filePath: 'docs/context-pack.md',
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.data.issueId).toBe(issueId);
    expect(createResponse.body.data.version).toBe(1);

    const listResponse = await request(app).get(`/api/issues/${issueId}/documents`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });

  it('returns 404 for unknown issue documents list', async () => {
    const listResponse = await request(app).get('/api/issues/unknown/documents');
    expect(listResponse.status).toBe(404);
    expect(listResponse.body.error.code).toBe('NOT_FOUND');
  });
});
