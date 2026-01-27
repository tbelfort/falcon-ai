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

  it('rejects empty X-Agent-ID header', async () => {
    const { app, issueId } = await createFixture();

    const response = await request(app)
      .get(`/api/agent/issues/${issueId}/context`)
      .set('X-Agent-ID', '');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects whitespace-only X-Agent-ID header', async () => {
    const { app, issueId } = await createFixture();

    const response = await request(app)
      .get(`/api/agent/issues/${issueId}/context`)
      .set('X-Agent-ID', '   ');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects X-Agent-ID header exceeding max length', async () => {
    const { app, issueId } = await createFixture();

    const longId = 'a'.repeat(101); // LIMITS.id = 100
    const response = await request(app)
      .get(`/api/agent/issues/${issueId}/context`)
      .set('X-Agent-ID', longId);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts X-Agent-ID header at max length', async () => {
    const { app, issueId, repos } = await createFixture();

    // Create an agent with exactly 100-char ID
    const longId = 'a'.repeat(100);
    const now = unixSeconds();
    const projectRes = await request(app).get(`/api/issues/${issueId}`);
    const projectId = projectRes.body.data.projectId as string;

    repos.agents.create({
      id: longId,
      projectId,
      name: 'LongIdAgent',
      agentType: 'claude',
      model: 'claude-3-5-sonnet',
      status: 'idle',
      currentIssueId: null,
      currentStage: null,
      workDir: '/tmp/falcon/long-agent',
      config: null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await request(app)
      .get(`/api/agent/issues/${issueId}/context`)
      .set('X-Agent-ID', longId);
    expect(response.status).toBe(200);
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

  it('defaults priority to normal when omitted in stage-message', async () => {
    const { app, issueId, agentId } = await createFixture();

    const stageRes = await request(app)
      .post(`/api/agent/issues/${issueId}/stage-message`)
      .set('X-Agent-ID', agentId)
      .send({ toStage: 'IMPLEMENT', message: 'Context ready' }); // No priority specified

    expect(stageRes.status).toBe(200);
    expect(stageRes.body.data.priority).toBe('normal');
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

  it('rejects agent accessing issue from different project', async () => {
    const { app, agentId } = await createFixture();

    // Create a second project with its own issue
    const project2Res = await request(app)
      .post('/api/projects')
      .send({ name: 'Project 2', slug: 'project-2', defaultBranch: 'main' });
    const project2Id = project2Res.body.data.id as string;

    const issue2Res = await request(app)
      .post('/api/issues')
      .send({ projectId: project2Id, title: 'Other project bug', priority: 'low' });
    const issue2Id = issue2Res.body.data.id as string;

    // Try to access project2's issue with project1's agent
    const response = await request(app)
      .get(`/api/agent/issues/${issue2Id}/context`)
      .set('X-Agent-ID', agentId);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('not assigned to this project');
  });

  it('returns context successfully with valid agent', async () => {
    const { app, issueId, agentId } = await createFixture();

    const response = await request(app)
      .get(`/api/agent/issues/${issueId}/context`)
      .set('X-Agent-ID', agentId);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty('issue');
    expect(response.body.data).toHaveProperty('project');
    expect(response.body.data).toHaveProperty('documents');
    expect(response.body.data).toHaveProperty('stageMessages');
    expect(response.body.data).toHaveProperty('workflow');
    expect(response.body.data.issue.id).toBe(issueId);
  });

  it('records errors via POST /error', async () => {
    const { app, issueId, agentId, repos } = await createFixture();

    const response = await request(app)
      .post(`/api/agent/issues/${issueId}/error`)
      .set('X-Agent-ID', agentId)
      .send({
        errorType: 'build_failed',
        message: 'TypeScript compilation errors',
        details: 'Cannot find module X',
      });

    expect(response.status).toBe(200);
    const runs = repos.workflowRuns.listByIssue(issueId);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('error');
    expect(runs[0].errorMessage).toContain('build_failed');
  });

  it('rejects invalid path in filesChanged', async () => {
    const { app, issueId, agentId } = await createFixture();

    const response = await request(app)
      .post(`/api/agent/issues/${issueId}/work-complete`)
      .set('X-Agent-ID', agentId)
      .send({
        summary: 'Attempted traversal',
        filesChanged: ['../../../etc/passwd'],
        testsPassed: true,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('Invalid filesChanged path');
  });
});
