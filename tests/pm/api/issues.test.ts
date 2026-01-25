import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../../../src/pm/api/server.js';
import { createInMemoryRepositories } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('Issues API', () => {
  let appContext: AppContext;
  let repos: ReturnType<typeof createInMemoryRepositories>;
  let projectId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    appContext = createApp({ repos });

    // Create a project for issues
    const projectRes = await request(appContext.app)
      .post('/api/projects')
      .send({ name: 'Test Project', slug: 'test-project' });
    projectId = projectRes.body.data.id;
  });

  afterAll(() => {
    repos.clear();
  });

  describe('POST /api/issues', () => {
    it('should create an issue with required fields', async () => {
      const res = await request(appContext.app).post('/api/issues').send({
        projectId,
        title: 'Fix bug',
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        projectId,
        title: 'Fix bug',
        status: 'backlog',
        stage: 'BACKLOG',
        priority: 'medium',
        number: 1,
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.labels).toEqual([]);
    });

    it('should create an issue with all fields', async () => {
      const res = await request(appContext.app).post('/api/issues').send({
        projectId,
        title: 'Critical bug',
        description: 'This needs urgent fixing',
        priority: 'critical',
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        title: 'Critical bug',
        description: 'This needs urgent fixing',
        priority: 'critical',
        status: 'backlog',
        stage: 'BACKLOG',
      });
    });

    it('should assign sequential issue numbers per project', async () => {
      const res1 = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Issue 1' });
      const res2 = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Issue 2' });
      const res3 = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Issue 3' });

      expect(res1.body.data.number).toBe(1);
      expect(res2.body.data.number).toBe(2);
      expect(res3.body.data.number).toBe(3);
    });
  });

  describe('GET /api/issues', () => {
    it('should list all issues', async () => {
      await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Issue A' });
      await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Issue B' });

      const res = await request(appContext.app).get('/api/issues');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should filter issues by projectId', async () => {
      // Create another project
      const project2Res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Project 2', slug: 'project-2' });
      const project2Id = project2Res.body.data.id;

      await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Project 1 Issue' });
      await request(appContext.app)
        .post('/api/issues')
        .send({ projectId: project2Id, title: 'Project 2 Issue' });

      const res = await request(appContext.app).get(`/api/issues?projectId=${projectId}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Project 1 Issue');
    });
  });

  describe('GET /api/issues/:id', () => {
    it('should return issue by ID', async () => {
      const createRes = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Get me' });
      const issueId = createRes.body.data.id;

      const res = await request(appContext.app).get(`/api/issues/${issueId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(issueId);
      expect(res.body.data.title).toBe('Get me');
    });

    it('should return 404 for non-existent issue', async () => {
      const res = await request(appContext.app).get('/api/issues/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/issues/:id', () => {
    it('should update issue title', async () => {
      const createRes = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Original' });
      const issueId = createRes.body.data.id;

      const res = await request(appContext.app)
        .patch(`/api/issues/${issueId}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated');
    });

    it('should update issue labels', async () => {
      // Create a label
      const labelRes = await request(appContext.app)
        .post(`/api/projects/${projectId}/labels`)
        .send({ name: 'bug', color: '#ff0000' });
      const labelId = labelRes.body.data.id;

      // Create an issue
      const createRes = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Labelled issue' });
      const issueId = createRes.body.data.id;

      // Update with labels
      const res = await request(appContext.app)
        .patch(`/api/issues/${issueId}`)
        .send({ labelIds: [labelId] });

      expect(res.status).toBe(200);
      expect(res.body.data.labels).toHaveLength(1);
      expect(res.body.data.labels[0].name).toBe('bug');
    });
  });

  describe('POST /api/issues/:id/start', () => {
    it('should start an issue with a preset', async () => {
      const createRes = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'To start' });
      const issueId = createRes.body.data.id;

      // Use the default preset from in-memory repos
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/start`)
        .send({ presetId: 'default-preset-id' });

      expect(res.status).toBe(200);
      expect(res.body.data.issue.status).toBe('in_progress');
      expect(res.body.data.issue.stage).toBe('CONTEXT_PACK');
      expect(res.body.data.branchName).toContain('issue/1-');
      expect(res.body.data.nextStage).toBe('CONTEXT_PACK');
    });

    it('should reject starting an already started issue', async () => {
      const createRes = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Already started' });
      const issueId = createRes.body.data.id;

      // Start it
      await request(appContext.app)
        .post(`/api/issues/${issueId}/start`)
        .send({ presetId: 'default-preset-id' });

      // Try to start again
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/start`)
        .send({ presetId: 'default-preset-id' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('POST /api/issues/:id/transition', () => {
    it('should transition issue to a valid stage', async () => {
      const createRes = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'To transition' });
      const issueId = createRes.body.data.id;

      // Start the issue first
      await request(appContext.app)
        .post(`/api/issues/${issueId}/start`)
        .send({ presetId: 'default-preset-id' });

      // Transition to CONTEXT_REVIEW
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/transition`)
        .send({ toStage: 'CONTEXT_REVIEW' });

      expect(res.status).toBe(200);
      expect(res.body.data.stage).toBe('CONTEXT_REVIEW');
    });

    it('should reject invalid transition', async () => {
      const createRes = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Invalid transition' });
      const issueId = createRes.body.data.id;

      // Try to transition directly from BACKLOG to IMPLEMENT (invalid)
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/transition`)
        .send({ toStage: 'IMPLEMENT' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('DELETE /api/issues/:id', () => {
    it('should delete an issue', async () => {
      const createRes = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'To delete' });
      const issueId = createRes.body.data.id;

      const deleteRes = await request(appContext.app).delete(`/api/issues/${issueId}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(appContext.app).get(`/api/issues/${issueId}`);
      expect(getRes.status).toBe(404);
    });
  });
});
