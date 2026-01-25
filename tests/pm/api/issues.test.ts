import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';

import { createApiApp } from '../../../src/pm/api/server.js';
import type { BroadcastFn } from '../../../src/pm/api/websocket.js';
import { createServices } from '../../../src/pm/core/services/index.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api issues', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    const repos = createInMemoryRepos();
    const services = createServices(repos, { now: () => 1_700_000_000_000 });
    const broadcast: BroadcastFn = () => undefined;
    app = createApiApp({ services, broadcast });
  });

  it('creates and lists issues per project', async () => {
    const projectResponse = await request(app).post('/api/projects').send({
      name: 'Bugfixes',
      slug: 'bugfixes',
      description: null,
      repoUrl: null,
      defaultBranch: 'main',
    });
    const projectId = projectResponse.body.data.id;

    const labelResponse = await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .send({ name: 'backend', color: '#ff0000' });
    const labelId = labelResponse.body.data.id;

    const issueResponse = await request(app).post('/api/issues').send({
      projectId,
      title: 'Fix auth bug',
      description: 'Repro steps',
      priority: 'medium',
    });
    expect(issueResponse.status).toBe(200);
    expect(issueResponse.body.data.stage).toBe('BACKLOG');
    expect(issueResponse.body.data.status).toBe('backlog');

    const updateResponse = await request(app)
      .patch(`/api/issues/${issueResponse.body.data.id}`)
      .send({ labelIds: [labelId] });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.labels).toHaveLength(1);

    const listResponse = await request(app).get('/api/issues').query({ projectId });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });
});
