import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import { createServer } from '../../../src/pm/api/server.js';
import request from 'supertest';

describe('API Validation', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createServer();
  });

  it('should fail to create project without name', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({
        slug: 'no-name-project',
      })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should fail to create project without slug', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({
        name: 'No Slug Project',
      })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return NOT_FOUND for nonexistent project', async () => {
    const response = await request(app)
      .get('/api/projects/nonexistent-id')
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('should return NOT_FOUND for nonexistent issue', async () => {
    const response = await request(app)
      .get('/api/issues/nonexistent-id')
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('should fail to get issues without projectId', async () => {
    const response = await request(app)
      .get('/api/issues')
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should fail to create comment without required fields', async () => {
    const response = await request(app)
      .post('/api/issues/test-id/comments')
      .send({
        content: 'Test comment',
      })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should fail to create document without required fields', async () => {
    const response = await request(app)
      .post('/api/issues/test-id/documents')
      .send({
        title: 'Test doc',
      })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should fail to start issue without presetId', async () => {
    const response = await request(app)
      .post('/api/issues/test-id/start')
      .send({})
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should fail to transition issue without toStage', async () => {
    const response = await request(app)
      .post('/api/issues/test-id/transition')
      .send({})
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});