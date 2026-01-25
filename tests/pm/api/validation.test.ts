import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createPmApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api validation', () => {
  it('returns validation errors for missing fields', async () => {
    const app = createPmApiApp({ repos: createInMemoryRepos() });

    const projectRes = await request(app).post('/api/projects').send({
      slug: 'missing-name',
    });
    expect(projectRes.body.error.code).toBe('VALIDATION_ERROR');

    const issueRes = await request(app).post('/api/issues').send({
      title: 'Missing projectId',
    });
    expect(issueRes.body.error.code).toBe('VALIDATION_ERROR');
  });
});
