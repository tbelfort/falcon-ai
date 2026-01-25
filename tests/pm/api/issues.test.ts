import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import { createServer } from '../../../src/pm/api/server.js';
import request from 'supertest';

describe('Issues API', () => {
  let app: express.Express;
  let projectId: string;

  beforeAll(async () => {
    app = createServer();
    const projectResponse = await request(app)
      .post('/api/projects')
      .send({
        name: 'Test Project for Issues',
        slug: 'test-issues-project',
      });
    projectId = projectResponse.body.data.id;
  });

  it('should return empty list of issues for a project', async () => {
    const response = await request(app)
      .get('/api/issues?projectId=' + projectId)
      .expect(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });

  it('should create an issue', async () => {
    const response = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Fix a bug',
        description: 'This is a bug that needs fixing',
        priority: 'high',
      })
      .expect(201);
    expect(response.body.data).toMatchObject({
      projectId,
      title: 'Fix a bug',
      description: 'This is a bug that needs fixing',
      priority: 'high',
      status: 'backlog',
      stage: 'BACKLOG',
      number: 1,
    });
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.labels).toEqual([]);
  });

  it('should get issues for a project', async () => {
    const response = await request(app)
      .get('/api/issues?projectId=' + projectId)
      .expect(200);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.meta.total).toBeGreaterThan(0);
  });

  it('should get a specific issue', async () => {
    const createResponse = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Get Test Issue',
      })
      .expect(201);

    const getResponse = await request(app)
      .get('/api/issues/' + createResponse.body.data.id)
      .expect(200);
    expect(getResponse.body.data.title).toBe('Get Test Issue');
  });

  it('should update an issue', async () => {
    const createResponse = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Update Test Issue',
      })
      .expect(201);

    const updateResponse = await request(app)
      .patch('/api/issues/' + createResponse.body.data.id)
      .send({
        title: 'Updated Title',
        priority: 'critical',
      })
      .expect(200);
    expect(updateResponse.body.data.title).toBe('Updated Title');
    expect(updateResponse.body.data.priority).toBe('critical');
  });

  it('should start an issue', async () => {
    const createResponse = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Start Test Issue',
        status: 'todo',
      })
      .expect(201);

    const startResponse = await request(app)
      .post('/api/issues/' + createResponse.body.data.id + '/start')
      .send({
        presetId: 'preset-123',
      })
      .expect(200);
    expect(startResponse.body.data.issue.status).toBe('in_progress');
    expect(startResponse.body.data.issue.stage).toBe('CONTEXT_PACK');
    expect(startResponse.body.data.issue.branchName).toBeDefined();
  });

  it('should fail to start a non-startable issue', async () => {
    const createResponse = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Non-startable Issue',
      })
      .expect(201);

    const issueId = createResponse.body.data.id;

    await request(app)
      .post('/api/issues/' + issueId + '/start')
      .send({
        presetId: 'preset-123',
      })
      .expect(200);

    await request(app)
      .post('/api/issues/' + issueId + '/start')
      .send({
        presetId: 'preset-456',
      })
      .expect(400);
  });

  it('should transition an issue stage', async () => {
    const createResponse = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Transition Test Issue',
      })
      .expect(201);

    const transitionResponse = await request(app)
      .post('/api/issues/' + createResponse.body.data.id + '/transition')
      .send({
        toStage: 'TODO',
      })
      .expect(200);
    expect(transitionResponse.body.data.stage).toBe('TODO');
  });

  it('should fail on invalid transition', async () => {
    const createResponse = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Invalid Transition Issue',
      })
      .expect(201);

    await request(app)
      .post('/api/issues/' + createResponse.body.data.id + '/transition')
      .send({
        toStage: 'DONE',
      })
      .expect(400);
  });

  it('should delete an issue', async () => {
    const createResponse = await request(app)
      .post('/api/issues')
      .send({
        projectId,
        title: 'Delete Test Issue',
      })
      .expect(201);

    await request(app)
      .delete('/api/issues/' + createResponse.body.data.id)
      .expect(200);

    await request(app)
      .get('/api/issues/' + createResponse.body.data.id)
      .expect(404);
  });

  it('should fail validation without projectId', async () => {
    await request(app)
      .post('/api/issues')
      .send({
        title: 'No Project Issue',
      })
      .expect(400);
  });
});