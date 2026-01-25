import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../../../src/pm/api/server.js';
import { createInMemoryRepositories } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('Projects API', () => {
  let appContext: AppContext;
  let repos: ReturnType<typeof createInMemoryRepositories>;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    appContext = createApp({ repos });
  });

  afterAll(() => {
    repos.clear();
  });

  describe('GET /api/projects', () => {
    it('should return empty array when no projects exist', async () => {
      const res = await request(appContext.app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });

    it('should return all projects', async () => {
      // Create a project first
      await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Test Project', slug: 'test-project' });

      const res = await request(appContext.app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Test Project');
      expect(res.body.data[0].slug).toBe('test-project');
    });
  });

  describe('POST /api/projects', () => {
    it('should create a project with required fields', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'My Project', slug: 'my-project' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'My Project',
        slug: 'my-project',
        description: null,
        repoUrl: null,
        defaultBranch: 'main',
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
    });

    it('should create a project with all fields', async () => {
      const res = await request(appContext.app).post('/api/projects').send({
        name: 'Full Project',
        slug: 'full-project',
        description: 'A complete project',
        repoUrl: 'https://github.com/owner/repo.git',
        defaultBranch: 'develop',
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Full Project',
        slug: 'full-project',
        description: 'A complete project',
        repoUrl: 'https://github.com/owner/repo.git',
        defaultBranch: 'develop',
      });
    });

    it('should return validation error for missing name', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ slug: 'no-name' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Name');
    });

    it('should return validation error for invalid slug', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Bad Slug Project', slug: 'Bad Slug!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Slug');
    });

    it('should return conflict error for duplicate slug', async () => {
      await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'First', slug: 'duplicate' });

      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Second', slug: 'duplicate' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return a project by ID', async () => {
      const createRes = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Get Test', slug: 'get-test' });

      const projectId = createRes.body.data.id;

      const res = await request(appContext.app).get(`/api/projects/${projectId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(projectId);
      expect(res.body.data.name).toBe('Get Test');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(appContext.app).get('/api/projects/non-existent-id');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('should update project name', async () => {
      const createRes = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Original', slug: 'original' });

      const projectId = createRes.body.data.id;

      const res = await request(appContext.app)
        .patch(`/api/projects/${projectId}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.slug).toBe('original');
    });

    it('should update project slug', async () => {
      const createRes = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Slug Test', slug: 'old-slug' });

      const projectId = createRes.body.data.id;

      const res = await request(appContext.app)
        .patch(`/api/projects/${projectId}`)
        .send({ slug: 'new-slug' });

      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe('new-slug');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(appContext.app)
        .patch('/api/projects/non-existent')
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete a project', async () => {
      const createRes = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'To Delete', slug: 'to-delete' });

      const projectId = createRes.body.data.id;

      const deleteRes = await request(appContext.app).delete(`/api/projects/${projectId}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(appContext.app).get(`/api/projects/${projectId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(appContext.app).delete('/api/projects/non-existent');

      expect(res.status).toBe(404);
    });
  });
});
