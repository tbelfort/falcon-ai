import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('PM API issues', () => {
  let app: ReturnType<typeof createApiApp>;
  const authToken = 'test-token';
  const authHeader = { Authorization: `Bearer ${authToken}` };

  beforeEach(() => {
    app = createApiApp({ repos: createInMemoryRepos(), authToken });
  });

  it('creates issues and supports updates, start, and transitions', async () => {
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
      .set(authHeader)
      .query({ projectId })
      .expect(200);
    expect(listResponse.body.data).toHaveLength(1);

    const labelResponse = await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .set(authHeader)
      .send({ name: 'bug', color: '#ff0000' })
      .expect(200);
    const labelId = labelResponse.body.data.id as string;

    const updateResponse = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader)
      .send({ labelIds: [labelId] })
      .expect(200);
    expect(updateResponse.body.data.labels).toHaveLength(1);
    expect(updateResponse.body.data.labels[0].id).toBe(labelId);

    const startResponse = await request(app)
      .post(`/api/issues/${issue.id}/start`)
      .set(authHeader)
      .send({ presetId: 'preset-123' })
      .expect(200);
    expect(startResponse.body.data.issue.status).toBe('in_progress');
    expect(startResponse.body.data.issue.stage).toBe('CONTEXT_PACK');
    expect(startResponse.body.data.branchName).toContain(`issue/${issue.number}-`);

    const transitionResponse = await request(app)
      .post(`/api/issues/${issue.id}/transition`)
      .set(authHeader)
      .send({ toStage: 'CONTEXT_REVIEW' })
      .expect(200);
    expect(transitionResponse.body.data.stage).toBe('CONTEXT_REVIEW');
  });

  it('retrieves and deletes issues', async () => {
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

    const getResponse = await request(app)
      .get(`/api/issues/${issueId}`)
      .set(authHeader)
      .expect(200);
    expect(getResponse.body.data.id).toBe(issueId);

    await request(app)
      .delete(`/api/issues/${issueId}`)
      .set(authHeader)
      .expect(200);

    await request(app)
      .get(`/api/issues/${issueId}`)
      .set(authHeader)
      .expect(404);
  });

  it('sets completedAt when transitioning to DONE', async () => {
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
      .post(`/api/issues/${issueId}/start`)
      .set(authHeader)
      .send({ presetId: 'preset-123' })
      .expect(200);

    const stages = [
      'CONTEXT_REVIEW',
      'IMPLEMENT',
      'PR_REVIEW',
      'PR_HUMAN_REVIEW',
      'TESTING',
      'DOC_REVIEW',
      'MERGE_READY',
      'DONE',
    ] as const;

    let latest: { status?: string; completedAt?: number | null } | null = null;
    for (const stage of stages) {
      const response = await request(app)
        .post(`/api/issues/${issueId}/transition`)
        .set(authHeader)
        .send({ toStage: stage })
        .expect(200);
      latest = response.body.data;
    }

    expect(latest?.status).toBe('done');
    expect(typeof latest?.completedAt).toBe('number');
  });
});
