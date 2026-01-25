import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';

import { createApiApp } from '../../../src/pm/api/server.js';
import type { BroadcastFn } from '../../../src/pm/api/websocket.js';
import { createServices } from '../../../src/pm/core/services/index.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api projects', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    const repos = createInMemoryRepos();
    const services = createServices(repos, { now: () => 1_700_000_000_000 });
    const broadcast: BroadcastFn = () => undefined;
    app = createApiApp({ services, broadcast });
  });

  it('creates, lists, fetches, updates, and deletes a project', async () => {
    const createResponse = await request(app).post('/api/projects').send({
      name: 'My Project',
      slug: 'my-project',
      description: null,
      repoUrl: null,
      defaultBranch: 'main',
    });

    expect(createResponse.status).toBe(200);
    const project = createResponse.body.data;
    expect(project.id).toBeTruthy();
    expect(project.name).toBe('My Project');

    const listResponse = await request(app).get('/api/projects');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const getResponse = await request(app).get(`/api/projects/${project.id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.slug).toBe('my-project');

    const updateResponse = await request(app)
      .patch(`/api/projects/${project.id}`)
      .send({ name: 'Updated Project' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.name).toBe('Updated Project');

    const deleteResponse = await request(app).delete(`/api/projects/${project.id}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.id).toBe(project.id);
  });
});
