import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('PM API documents', () => {
  let app: ReturnType<typeof createApiApp>;
  const authToken = 'test-token';
  const authHeader = { Authorization: `Bearer ${authToken}` };

  beforeEach(() => {
    app = createApiApp({ repos: createInMemoryRepos(), authToken });
  });

  it('creates and lists documents with path validation', async () => {
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

    const issueResponse = await request(app)
      .post('/api/issues')
      .set(authHeader)
      .send({ projectId, title: 'Task' })
      .expect(200);
    const issueId = issueResponse.body.data.id as string;

    await request(app)
      .post(`/api/issues/${issueId}/documents`)
      .set(authHeader)
      .send({
        title: 'Context Pack',
        docType: 'context_pack',
        filePath: '.falcon/issues/123/context-pack.md',
      })
      .expect(200);

    const listResponse = await request(app)
      .get(`/api/issues/${issueId}/documents`)
      .set(authHeader)
      .expect(200);
    expect(listResponse.body.data).toHaveLength(1);

    const invalidPathResponse = await request(app)
      .post(`/api/issues/${issueId}/documents`)
      .set(authHeader)
      .send({
        title: 'Spec',
        docType: 'spec',
        filePath: '../secrets.md',
      })
      .expect(400);
    expect(invalidPathResponse.body.error.code).toBe('VALIDATION_ERROR');
  });
});
