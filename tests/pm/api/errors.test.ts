import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api error paths', () => {
  it('rejects duplicate project slugs', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const first = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/projects')
      .send({ name: 'Other', slug: 'project', defaultBranch: 'main' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('rejects invalid issue transitions', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });
    const issueId = issueRes.body.data.id as string;

    const transitionRes = await request(app)
      .post(`/api/issues/${issueId}/transition`)
      .send({ toStage: 'SPEC' });

    expect(transitionRes.status).toBe(400);
    expect(transitionRes.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects starting an issue twice', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });
    const issueId = issueRes.body.data.id as string;

    const firstStart = await request(app)
      .post(`/api/issues/${issueId}/start`)
      .send({ presetId: 'preset-1' });
    expect(firstStart.status).toBe(200);

    const secondStart = await request(app)
      .post(`/api/issues/${issueId}/start`)
      .send({ presetId: 'preset-1' });

    expect(secondStart.status).toBe(400);
    expect(secondStart.body.error.code).toBe('VALIDATION_ERROR');
  });
});
