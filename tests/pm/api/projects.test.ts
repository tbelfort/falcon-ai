import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import { createServer } from '../../../src/pm/api/server.js';
import request from 'supertest';

describe('Projects API', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createServer();
  });

  it('should return empty list of projects', async () => {
    const response = await request(app).get('/api/projects').expect(200);
    expect(response.body).toEqual({ data: [] });
  });

  it('should create a project', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({
        name: 'Test Project',
        slug: 'test-project',
        description: 'A test project',
        repoUrl: 'https://github.com/test/repo.git',
        defaultBranch: 'main',
      })
      .expect(201);
    expect(response.body.data).toMatchObject({
      name: 'Test Project',
      slug: 'test-project',
      description: 'A test project',
      repoUrl: 'https://github.com/test/repo.git',
      defaultBranch: 'main',
      config: null,
    });
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.createdAt).toBeDefined();
  });

  it('should get all projects', async () => {
    const response = await request(app).get('/api/projects').expect(200);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('should get a specific project', async () => {
    const createResponse = await request(app)
      .post('/api/projects')
      .send({
        name: 'Get Test',
        slug: 'get-test',
      })
      .expect(201);

    const getResponse = await request(app)
      .get(`/api/projects/${createResponse.body.data.id}`)
      .expect(200);
    expect(getResponse.body.data.name).toBe('Get Test');
  });

  it('should update a project', async () => {
    const createResponse = await request(app)
      .post('/api/projects')
      .send({
        name: 'Update Test',
        slug: 'update-test',
      })
      .expect(201);

    const updateResponse = await request(app)
      .patch(`/api/projects/${createResponse.body.data.id}`)
      .send({
        name: 'Updated Name',
      })
      .expect(200);
    expect(updateResponse.body.data.name).toBe('Updated Name');
  });

  it('should delete a project', async () => {
    const createResponse = await request(app)
      .post('/api/projects')
      .send({
        name: 'Delete Test',
        slug: 'delete-test',
      })
      .expect(201);

    await request(app)
      .delete(`/api/projects/${createResponse.body.data.id}`)
      .expect(200);

    await request(app)
      .get(`/api/projects/${createResponse.body.data.id}`)
      .expect(404);
  });

  it('should fail with conflict on duplicate slug', async () => {
    await request(app)
      .post('/api/projects')
      .send({
        name: 'First Project',
        slug: 'duplicate-slug',
      })
      .expect(201);

    await request(app)
      .post('/api/projects')
      .send({
        name: 'Second Project',
        slug: 'duplicate-slug',
      })
      .expect(409);
  });
});