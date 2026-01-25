import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createPmApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api issues', () => {
  it('creates and lists issues for a project', async () => {
    const app = createPmApiApp({ repos: createInMemoryRepos() });

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Issues Project', slug: 'issues-project' });
    const projectId = projectRes.body.data.id as string;

    const labelRes = await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .send({ name: 'bug' });
    const labelId = labelRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Fix bug',
        description: 'Details',
        priority: 'medium',
      });
    expect(issueRes.body.data.projectId).toBe(projectId);

    const listRes = await request(app).get(`/api/issues?projectId=${projectId}`);
    expect(listRes.body.data).toHaveLength(1);

    const updateRes = await request(app)
      .patch(`/api/issues/${issueRes.body.data.id}`)
      .send({ labelIds: [labelId] });
    expect(updateRes.body.data.labels).toHaveLength(1);
    expect(updateRes.body.data.labels[0].id).toBe(labelId);
  });
});
