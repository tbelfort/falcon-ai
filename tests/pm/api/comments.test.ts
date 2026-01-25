import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('PM API comments', () => {
  let app: ReturnType<typeof createApiApp>;
  const authToken = 'test-token';
  const authHeader = { Authorization: `Bearer ${authToken}` };

  beforeEach(() => {
    app = createApiApp({ repos: createInMemoryRepos(), authToken });
  });

  it('creates and lists comments with parent validation', async () => {
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

    const firstCommentResponse = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .set(authHeader)
      .send({
        content: 'First comment',
        authorType: 'human',
        authorName: 'Alice',
      })
      .expect(200);
    const parentId = firstCommentResponse.body.data.id as string;

    await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .set(authHeader)
      .send({
        content: 'Reply',
        authorType: 'human',
        authorName: 'Bob',
        parentId,
      })
      .expect(200);

    const listResponse = await request(app)
      .get(`/api/issues/${issueId}/comments`)
      .set(authHeader)
      .expect(200);
    expect(listResponse.body.data).toHaveLength(2);

    const invalidParentResponse = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .set(authHeader)
      .send({
        content: 'Invalid parent',
        authorType: 'human',
        authorName: 'Charlie',
        parentId: 'missing',
      })
      .expect(400);
    expect(invalidParentResponse.body.error.code).toBe('VALIDATION_ERROR');
  });
});
