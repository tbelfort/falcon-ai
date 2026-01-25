import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createPmApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api projects', () => {
  it('creates, lists, gets, updates, and deletes a project', async () => {
    const app = createPmApiApp({ repos: createInMemoryRepos() });

    const createRes = await request(app)
      .post('/api/projects')
      .send({ name: 'My Project', slug: 'my-project', defaultBranch: 'main' });
    expect(createRes.body.data.name).toBe('My Project');
    const projectId = createRes.body.data.id as string;

    const listRes = await request(app).get('/api/projects');
    expect(listRes.body.data).toHaveLength(1);

    const getRes = await request(app).get(`/api/projects/${projectId}`);
    expect(getRes.body.data.slug).toBe('my-project');

    const updateRes = await request(app)
      .patch(`/api/projects/${projectId}`)
      .send({ description: 'Updated' });
    expect(updateRes.body.data.description).toBe('Updated');

    const deleteRes = await request(app).delete(`/api/projects/${projectId}`);
    expect(deleteRes.body.data.id).toBe(projectId);
  });
});
