import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api projects', () => {
  it('creates, lists, gets, updates, and deletes a project', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const createRes = await request(app)
      .post('/api/projects')
      .send({
        name: 'My Project',
        slug: 'my-project',
        description: null,
        repoUrl: null,
        defaultBranch: 'main',
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body.data.name).toBe('My Project');
    const projectId = createRes.body.data.id as string;

    const listRes = await request(app).get('/api/projects');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const getRes = await request(app).get(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(projectId);

    const updateRes = await request(app)
      .patch(`/api/projects/${projectId}`)
      .send({ description: 'Updated description' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.description).toBe('Updated description');

    const deleteRes = await request(app).delete(`/api/projects/${projectId}`);
    expect(deleteRes.status).toBe(200);

    const missingRes = await request(app).get(`/api/projects/${projectId}`);
    expect(missingRes.status).toBe(404);
    expect(missingRes.body.error.code).toBe('NOT_FOUND');
  });
});
