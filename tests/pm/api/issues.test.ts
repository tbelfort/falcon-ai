import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('PM API issues', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    app = createApiApp({ repos: createInMemoryRepos() });
  });

  it('creates issues and supports updates, start, and transitions', async () => {
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
      .send({
        projectId,
        title: 'Fix bug',
        description: 'Details',
        priority: 'medium',
      })
      .expect(200);
    const issue = issueResponse.body.data;

    expect(issue.projectId).toBe(projectId);
    expect(issue.status).toBe('backlog');
    expect(issue.stage).toBe('BACKLOG');
    expect(issue.labels).toEqual([]);

    const listResponse = await request(app)
      .get('/api/issues')
      .query({ projectId })
      .expect(200);
    expect(listResponse.body.data).toHaveLength(1);

    const labelResponse = await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .send({ name: 'bug', color: '#ff0000' })
      .expect(200);
    const labelId = labelResponse.body.data.id as string;

    const updateResponse = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .send({ labelIds: [labelId] })
      .expect(200);
    expect(updateResponse.body.data.labels).toHaveLength(1);
    expect(updateResponse.body.data.labels[0].id).toBe(labelId);

    const startResponse = await request(app)
      .post(`/api/issues/${issue.id}/start`)
      .send({ presetId: 'preset-123' })
      .expect(200);
    expect(startResponse.body.data.issue.status).toBe('in_progress');
    expect(startResponse.body.data.issue.stage).toBe('CONTEXT_PACK');
    expect(startResponse.body.data.branchName).toContain(`issue/${issue.number}-`);

    const transitionResponse = await request(app)
      .post(`/api/issues/${issue.id}/transition`)
      .send({ toStage: 'CONTEXT_REVIEW' })
      .expect(200);
    expect(transitionResponse.body.data.stage).toBe('CONTEXT_REVIEW');
  });
});
