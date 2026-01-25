import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api validation', () => {
  it('returns validation errors for bad payloads', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app).post('/api/projects').send({});
    expect(projectRes.status).toBe(400);
    expect(projectRes.body.error.code).toBe('VALIDATION_ERROR');

    const issueQueryRes = await request(app).get('/api/issues');
    expect(issueQueryRes.status).toBe(400);
    expect(issueQueryRes.body.error.code).toBe('VALIDATION_ERROR');

    const createProjectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project' });
    const projectId = createProjectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Oops', priority: 'urgent' });
    expect(issueRes.status).toBe(400);
    expect(issueRes.body.error.code).toBe('VALIDATION_ERROR');
  });
});
