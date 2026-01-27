import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';
import { unixSeconds } from '../../../src/pm/core/utils/time.js';

async function createFixture() {
  const repos = createInMemoryRepos();
  const app = createApiServer({ repos });

  const projectRes = await request(app)
    .post('/api/projects')
    .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
  const projectId = projectRes.body.data.id as string;

  const issueRes = await request(app)
    .post('/api/issues')
    .send({ projectId, title: 'Fix bug', priority: 'medium' });
  const issueId = issueRes.body.data.id as string;

  const now = unixSeconds();
  const agent = repos.agents.create({
    id: 'agent-1',
    projectId,
    name: 'Falcon',
    agentType: 'claude',
    model: 'claude-3-5-sonnet',
    status: 'idle',
    currentIssueId: null,
    currentStage: null,
    workDir: '/tmp/falcon/agent-1',
    config: null,
    totalTasksCompleted: 0,
    lastActiveAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { repos, app, issueId, agentId: agent.id };
}

describe('pm agent api', () => {
  it('requires X-Agent-ID header', async () => {
    const { app, issueId } = await createFixture();

    const response = await request(app).get(`/api/agent/issues/${issueId}/context`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates agent comments', async () => {
    const { app, issueId, agentId } = await createFixture();

    const response = await request(app)
      .post(`/api/agent/issues/${issueId}/comment`)
      .set('X-Agent-ID', agentId)
      .send({ content: 'Work complete' });

    expect(response.status).toBe(200);
    expect(response.body.data.issueId).toBe(issueId);
    expect(response.body.data.authorType).toBe('agent');
    expect(response.body.data.authorName).toBe('Falcon');
  });

  it('creates stage messages and fetches unread messages', async () => {
    const { app, issueId, agentId } = await createFixture();

    const stageRes = await request(app)
      .post(`/api/agent/issues/${issueId}/stage-message`)
      .set('X-Agent-ID', agentId)
      .send({ toStage: 'PR_REVIEW', message: 'Ready for review', priority: 'important' });

    expect(stageRes.status).toBe(200);

    const messagesRes = await request(app)
      .get(`/api/agent/issues/${issueId}/messages?forStage=PR_REVIEW`)
      .set('X-Agent-ID', agentId);

    expect(messagesRes.status).toBe(200);
    expect(messagesRes.body.data).toHaveLength(1);
    expect(messagesRes.body.data[0].message).toBe('Ready for review');
  });

  it('records work completion', async () => {
    const { app, issueId, agentId, repos } = await createFixture();

    const response = await request(app)
      .post(`/api/agent/issues/${issueId}/work-complete`)
      .set('X-Agent-ID', agentId)
      .send({
        summary: 'Implemented endpoints',
        filesChanged: ['src/pm/api/routes/agent/issues.ts'],
        testsPassed: true,
      });

    expect(response.status).toBe(200);
    const runs = repos.workflowRuns.listByIssue(issueId);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('completed');
  });
});
