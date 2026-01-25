import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('PM API labels', () => {
  let app: ReturnType<typeof createApiApp>;
  const authToken = 'test-token';
  const authHeader = { Authorization: `Bearer ${authToken}` };

  beforeEach(() => {
    app = createApiApp({ repos: createInMemoryRepos(), authToken });
  });

  it('creates and lists labels with conflict handling', async () => {
    const projectResponse = await request(app)
      .post('/api/projects')
      .set(authHeader)
      .send({
        name: 'Project',
        slug: 'project',
        description: null,
        repoUrl: null,
        defaultBranch: 'main',
      })
      .expect(200);
    const projectId = projectResponse.body.data.id as string;

    const labelResponse = await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .set(authHeader)
      .send({ name: 'bug', color: '#ff0000' })
      .expect(200);
    expect(labelResponse.body.data.name).toBe('bug');

    const listResponse = await request(app)
      .get(`/api/projects/${projectId}/labels`)
      .set(authHeader)
      .expect(200);
    expect(listResponse.body.data).toHaveLength(1);

    const conflictResponse = await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .set(authHeader)
      .send({ name: 'bug', color: '#ff0000' })
      .expect(409);
    expect(conflictResponse.body.error.code).toBe('CONFLICT');
  });
});
