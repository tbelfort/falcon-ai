import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';
import { isSafeRelativePath, requireString, parsePagination, PAGINATION } from '../../../src/pm/api/validation.js';

describe('pm api validation', () => {
  it('returns validation errors for bad payloads', async () => {
    const app = createApiServer({ repos: createInMemoryRepos() });

    const projectRes = await request(app).post('/api/projects').send({});
    expect(projectRes.status).toBe(400);
    expect(projectRes.body.error.code).toBe('VALIDATION_ERROR');

    const issueQueryRes = await request(app).get('/api/issues');
    expect(issueQueryRes.status).toBe(400);
    expect(issueQueryRes.body.error.code).toBe('VALIDATION_ERROR');

    const createProjectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project' });
    const projectId = createProjectRes.body.data.id as string;

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Oops', priority: 'urgent' });
    expect(issueRes.status).toBe(400);
    expect(issueRes.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('isSafeRelativePath', () => {
  it('rejects absolute paths', () => {
    expect(isSafeRelativePath('/etc/passwd')).toBe(false);
    expect(isSafeRelativePath('/usr/local/bin')).toBe(false);
    expect(isSafeRelativePath('C:\\Windows\\System32')).toBe(false);
  });

  it('rejects backslash-prefixed paths', () => {
    expect(isSafeRelativePath('\\server\\share')).toBe(false);
  });

  it('rejects double-slash prefixed paths', () => {
    expect(isSafeRelativePath('//network/share')).toBe(false);
  });

  it('rejects paths with .. traversal', () => {
    expect(isSafeRelativePath('../etc/passwd')).toBe(false);
    expect(isSafeRelativePath('foo/../../../etc/passwd')).toBe(false);
    expect(isSafeRelativePath('foo/bar/../../..')).toBe(false);
    expect(isSafeRelativePath('..\\windows\\system32')).toBe(false);
  });

  it('accepts valid relative paths', () => {
    expect(isSafeRelativePath('src/pm/api/routes.ts')).toBe(true);
    expect(isSafeRelativePath('foo/bar/baz.ts')).toBe(true);
    expect(isSafeRelativePath('file.txt')).toBe(true);
    expect(isSafeRelativePath('./relative/path')).toBe(true);
    expect(isSafeRelativePath('a/b/c/d/e/f/g.js')).toBe(true);
  });

  it('handles edge cases', () => {
    expect(isSafeRelativePath('')).toBe(true); // empty is valid (no segments)
    expect(isSafeRelativePath('...')).toBe(true); // ... is not ..
    expect(isSafeRelativePath('foo..bar')).toBe(true); // .. in name is ok
  });
});

describe('requireString', () => {
  it('returns null for non-string types', () => {
    expect(requireString(null)).toBe(null);
    expect(requireString(undefined)).toBe(null);
    expect(requireString(123)).toBe(null);
    expect(requireString(true)).toBe(null);
    expect(requireString({})).toBe(null);
    expect(requireString([])).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(requireString('')).toBe(null);
  });

  it('returns null for whitespace-only string', () => {
    expect(requireString('   ')).toBe(null);
    expect(requireString('\t\n')).toBe(null);
  });

  it('returns trimmed string for valid input', () => {
    expect(requireString('hello')).toBe('hello');
    expect(requireString('  hello  ')).toBe('hello');
    expect(requireString('hello world')).toBe('hello world');
  });
});

describe('parsePagination', () => {
  it('returns defaults when both values undefined', () => {
    const result = parsePagination(undefined, undefined);
    expect(result).toEqual({
      page: PAGINATION.defaultPage,
      perPage: PAGINATION.defaultPerPage,
    });
  });

  it('returns null for invalid page (non-positive)', () => {
    expect(parsePagination(0, undefined)).toBe(null);
    expect(parsePagination(-1, undefined)).toBe(null);
  });

  it('returns null for invalid page (non-integer)', () => {
    expect(parsePagination(3.14, undefined)).toBe(null);
    expect(parsePagination('abc', undefined)).toBe(null);
  });

  it('returns null for invalid perPage', () => {
    expect(parsePagination(undefined, 0)).toBe(null);
    expect(parsePagination(undefined, -5)).toBe(null);
    expect(parsePagination(undefined, 'xyz')).toBe(null);
  });

  it('caps perPage at maxPerPage', () => {
    const result = parsePagination(1, 500);
    expect(result?.perPage).toBe(PAGINATION.maxPerPage);
  });

  it('accepts valid string numbers', () => {
    const result = parsePagination('2', '25');
    expect(result).toEqual({ page: 2, perPage: 25 });
  });

  it('handles mixed valid/invalid inputs', () => {
    expect(parsePagination(1, 'invalid')).toBe(null);
    expect(parsePagination('invalid', 10)).toBe(null);
  });
});
