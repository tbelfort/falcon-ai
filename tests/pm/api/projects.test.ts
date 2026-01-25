import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('PM API projects', () => {
  let app: ReturnType<typeof createApiApp>;
  const authToken = 'test-token';
  const authHeader = { Authorization: `Bearer ${authToken}` };

  beforeEach(() => {
    app = createApiApp({ repos: createInMemoryRepos(), authToken });
  });

  it('creates, lists, retrieves, updates, and deletes projects', async () => {
    const createResponse = await request(app)
      .post('/api/projects')
      .set(authHeader)
      .send({
        name: 'My Project',
        slug: 'my-project',
        description: null,
        repoUrl: null,
        defaultBranch: 'main',
      })
      .expect(200);

    const created = createResponse.body.data;
    expect(created.name).toBe('My Project');
    expect(created.slug).toBe('my-project');
    expect(created.defaultBranch).toBe('main');
    expect(created.config).toEqual({});
    expect(typeof created.id).toBe('string');

    const listResponse = await request(app)
      .get('/api/projects')
      .set(authHeader)
      .expect(200);
    expect(listResponse.body.data).toHaveLength(1);

    const getResponse = await request(app)
      .get(`/api/projects/${created.id}`)
      .set(authHeader)
      .expect(200);
    expect(getResponse.body.data.id).toBe(created.id);

    const updateResponse = await request(app)
      .patch(`/api/projects/${created.id}`)
      .set(authHeader)
      .send({ name: 'Renamed Project', description: 'Updated' })
      .expect(200);
    expect(updateResponse.body.data.name).toBe('Renamed Project');
    expect(updateResponse.body.data.description).toBe('Updated');

    await request(app)
      .delete(`/api/projects/${created.id}`)
      .set(authHeader)
      .expect(200);

    const afterDelete = await request(app)
      .get(`/api/projects/${created.id}`)
      .set(authHeader)
      .expect(404);
    expect(afterDelete.body.error.code).toBe('NOT_FOUND');
  });
});
