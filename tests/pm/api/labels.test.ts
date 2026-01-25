import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';

import { createApiApp } from '../../../src/pm/api/server.js';
import type { BroadcastFn } from '../../../src/pm/api/websocket.js';
import { createServices } from '../../../src/pm/core/services/index.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api labels', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    const repos = createInMemoryRepos();
    const services = createServices(repos, { now: () => 1_700_000_000 });
    const broadcast: BroadcastFn = () => undefined;
    app = createApiApp({ services, broadcast });
  });

  it('creates and lists labels per project', async () => {
    const projectResponse = await request(app).post('/api/projects').send({
      name: 'Labels',
      slug: 'labels',
      description: null,
      repoUrl: null,
      defaultBranch: 'main',
    });
    const projectId = projectResponse.body.data.id;

    const createResponse = await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .send({ name: 'frontend', color: '#ff0000' });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.data.name).toBe('frontend');

    const listResponse = await request(app).get(`/api/projects/${projectId}/labels`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });

  it('returns 404 for unknown project labels list', async () => {
    const listResponse = await request(app).get('/api/projects/unknown/labels');
    expect(listResponse.status).toBe(404);
    expect(listResponse.body.error.code).toBe('NOT_FOUND');
  });
});
