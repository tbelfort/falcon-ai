import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('PM API validation', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    app = createApiApp({ repos: createInMemoryRepos() });
  });

  it('returns validation errors for invalid payloads', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({ slug: 'missing-name', defaultBranch: 'main' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires projectId when listing issues', async () => {
    const response = await request(app).get('/api/issues').expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates stage transitions', async () => {
    const projectResponse = await request(app)
      .post('/api/projects')
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
      .send({ projectId, title: 'Task' })
      .expect(200);
    const issueId = issueResponse.body.data.id as string;

    const invalidStage = await request(app)
      .post(`/api/issues/${issueId}/transition`)
      .send({ toStage: 'NOT_A_STAGE' })
      .expect(400);
    expect(invalidStage.body.error.code).toBe('VALIDATION_ERROR');

    const invalidTransition = await request(app)
      .post(`/api/issues/${issueId}/transition`)
      .send({ toStage: 'DONE' })
      .expect(400);
    expect(invalidTransition.body.error.code).toBe('INVALID_TRANSITION');
  });
});
