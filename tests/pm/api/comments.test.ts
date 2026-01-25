import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api comments', () => {
  it('creates and lists comments', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });
    const issueId = issueRes.body.data.id as string;

    const commentRes = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .send({ content: 'Looks good', authorType: 'human', authorName: 'Alex' });

    expect(commentRes.status).toBe(200);
    expect(commentRes.body.data.issueId).toBe(issueId);

    const listRes = await request(app).get(`/api/issues/${issueId}/comments`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects invalid parentId', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });
    const issueId = issueRes.body.data.id as string;

    const commentRes = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .send({
        content: 'Reply',
        authorType: 'human',
        authorName: 'Alex',
        parentId: 'missing-parent',
      });

    expect(commentRes.status).toBe(400);
    expect(commentRes.body.error.code).toBe('VALIDATION_ERROR');
  });
});
