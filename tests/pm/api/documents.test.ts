import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api documents', () => {
  it('creates and lists documents', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });
    const issueId = issueRes.body.data.id as string;

    const documentRes = await request(app)
      .post(`/api/issues/${issueId}/documents`)
      .send({
        title: 'Context Pack',
        docType: 'context_pack',
        filePath: '.falcon/issues/1/context/context-pack.md',
      });

    expect(documentRes.status).toBe(200);
    expect(documentRes.body.data.issueId).toBe(issueId);

    const listRes = await request(app).get(`/api/issues/${issueId}/documents`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects unsafe document paths', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });
    const issueId = issueRes.body.data.id as string;

    const documentRes = await request(app)
      .post(`/api/issues/${issueId}/documents`)
      .send({
        title: 'Bad path',
        docType: 'context_pack',
        filePath: '../secrets.txt',
      });

    expect(documentRes.status).toBe(400);
    expect(documentRes.body.error.code).toBe('VALIDATION_ERROR');
  });
});
