import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm api issues', () => {
  it('creates, lists, and updates issues with labels', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Fix bug',
        description: 'Details',
        priority: 'medium',
      });

    expect(issueRes.status).toBe(200);
    expect(issueRes.body.data.status).toBe('backlog');
    expect(issueRes.body.data.stage).toBe('BACKLOG');
    const issueId = issueRes.body.data.id as string;

    const labelRes = await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .send({ name: 'bug', color: '#ef4444' });
    const labelId = labelRes.body.data.id as string;

    const updateRes = await request(app)
      .patch(`/api/issues/${issueId}`)
      .send({ labelIds: [labelId] });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.labels).toHaveLength(1);
    expect(updateRes.body.data.labels[0].id).toBe(labelId);

    const listRes = await request(app).get(`/api/issues?projectId=${projectId}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
  });
});
