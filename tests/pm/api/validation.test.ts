import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../../../src/pm/api/server.js';
import { createInMemoryRepositories } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('API Validation', () => {
  let appContext: AppContext;
  let repos: ReturnType<typeof createInMemoryRepositories>;
  let projectId: string;
  let issueId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    appContext = createApp({ repos });

    // Create a project and issue for tests
    const projectRes = await request(appContext.app)
      .post('/api/projects')
      .send({ name: 'Validation Test', slug: 'validation-test' });
    projectId = projectRes.body.data.id;

    const issueRes = await request(appContext.app)
      .post('/api/issues')
      .send({ projectId, title: 'Test Issue' });
    issueId = issueRes.body.data.id;
  });

  afterAll(() => {
    repos.clear();
  });

  describe('Project validation', () => {
    it('should reject empty name', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: '', slug: 'empty-name' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject whitespace-only name', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: '   ', slug: 'whitespace-name' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject empty slug', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Empty Slug', slug: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject slug with uppercase', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Uppercase Slug', slug: 'Upper-Case' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject slug with spaces', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Space Slug', slug: 'has space' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject slug with special characters', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Special Slug', slug: 'special!@#' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid kebab-case slug', async () => {
      const res = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Valid Slug', slug: 'valid-kebab-case-123' });

      expect(res.status).toBe(201);
    });
  });

  describe('Issue validation', () => {
    it('should reject empty title', async () => {
      const res = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject non-existent projectId', async () => {
      const res = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId: 'non-existent', title: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid priority', async () => {
      const res = await request(appContext.app)
        .post('/api/issues')
        .send({ projectId, title: 'Test', priority: 'super-urgent' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid priorities', async () => {
      for (const priority of ['low', 'medium', 'high', 'critical']) {
        const res = await request(appContext.app)
          .post('/api/issues')
          .send({ projectId, title: `${priority} priority issue`, priority });

        expect(res.status).toBe(201);
        expect(res.body.data.priority).toBe(priority);
      }
    });
  });

  describe('Label validation', () => {
    it('should reject empty label name', async () => {
      const res = await request(appContext.app)
        .post(`/api/projects/${projectId}/labels`)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid color format', async () => {
      const res = await request(appContext.app)
        .post(`/api/projects/${projectId}/labels`)
        .send({ name: 'bad-color', color: 'red' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid hex color', async () => {
      const res = await request(appContext.app)
        .post(`/api/projects/${projectId}/labels`)
        .send({ name: 'good-color', color: '#ff5500' });

      expect(res.status).toBe(201);
      expect(res.body.data.color).toBe('#ff5500');
    });

    it('should reject duplicate label names in same project', async () => {
      await request(appContext.app)
        .post(`/api/projects/${projectId}/labels`)
        .send({ name: 'duplicate' });

      const res = await request(appContext.app)
        .post(`/api/projects/${projectId}/labels`)
        .send({ name: 'duplicate' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Comment validation', () => {
    it('should reject empty content', async () => {
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/comments`)
        .send({ content: '', authorType: 'human', authorName: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid authorType', async () => {
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/comments`)
        .send({ content: 'Test', authorType: 'bot', authorName: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject empty authorName', async () => {
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/comments`)
        .send({ content: 'Test', authorType: 'human', authorName: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid human comment', async () => {
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/comments`)
        .send({ content: 'Great work!', authorType: 'human', authorName: 'John' });

      expect(res.status).toBe(201);
      expect(res.body.data.authorType).toBe('human');
    });

    it('should accept valid agent comment', async () => {
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/comments`)
        .send({ content: 'Analysis complete', authorType: 'agent', authorName: 'Claude' });

      expect(res.status).toBe(201);
      expect(res.body.data.authorType).toBe('agent');
    });
  });

  describe('Document validation', () => {
    it('should reject empty title', async () => {
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/documents`)
        .send({ title: '', docType: 'spec', filePath: '/path/to/file' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid docType', async () => {
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/documents`)
        .send({ title: 'Test', docType: 'unknown', filePath: '/path/to/file' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject empty filePath', async () => {
      const res = await request(appContext.app)
        .post(`/api/issues/${issueId}/documents`)
        .send({ title: 'Test', docType: 'spec', filePath: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid document types', async () => {
      for (const docType of ['context_pack', 'spec', 'ai_doc', 'other']) {
        const res = await request(appContext.app)
          .post(`/api/issues/${issueId}/documents`)
          .send({ title: `${docType} doc`, docType, filePath: `/path/${docType}.md` });

        expect(res.status).toBe(201);
        expect(res.body.data.docType).toBe(docType);
      }
    });
  });

  describe('Response envelope format', () => {
    it('should return data in ApiSuccess format', async () => {
      const res = await request(appContext.app).get('/api/projects');

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return error in ApiError format', async () => {
      const res = await request(appContext.app).get('/api/projects/non-existent');

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
    });
  });
});
