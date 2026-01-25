import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';

import { createApiApp } from '../../../src/pm/api/server.js';
import type { BroadcastFn } from '../../../src/pm/api/websocket.js';
import { createServices } from '../../../src/pm/core/services/index.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api comments', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    const repos = createInMemoryRepos();
    const services = createServices(repos, { now: () => 1_700_000_000 });
    const broadcast: BroadcastFn = () => undefined;
    app = createApiApp({ services, broadcast });
  });

  it('creates and lists comments per issue', async () => {
    const projectResponse = await request(app).post('/api/projects').send({
      name: 'Comments',
      slug: 'comments',
      description: null,
      repoUrl: null,
      defaultBranch: 'main',
    });
    const projectId = projectResponse.body.data.id;

    const issueResponse = await request(app).post('/api/issues').send({
      projectId,
      title: 'Commented issue',
      description: null,
      priority: 'medium',
    });
    const issueId = issueResponse.body.data.id;

    const createResponse = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .send({ content: 'Looks good', authorType: 'human', authorName: 'Tom' });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.data.issueId).toBe(issueId);

    const listResponse = await request(app).get(`/api/issues/${issueId}/comments`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });

  it('returns 404 for unknown issue comments list', async () => {
    const listResponse = await request(app).get('/api/issues/unknown/comments');
    expect(listResponse.status).toBe(404);
    expect(listResponse.body.error.code).toBe('NOT_FOUND');
  });
});
