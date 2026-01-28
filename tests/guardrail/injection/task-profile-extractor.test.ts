import { describe, it, expect } from 'vitest';
import {
  extractTaskProfileFromIssue,
  extractTaskProfileFromContextPack,
  extractTouches,
  extractTechnologies,
  extractTaskTypes,
} from '../../../src/guardrail/injection/task-profile-extractor.js';

describe('extractTaskProfileFromIssue', () => {
  it('extracts database touches from SQL description', () => {
    const profile = extractTaskProfileFromIssue({
      title: 'Add user search endpoint',
      description: 'Implement SQL query to search users by name',
      labels: ['feature', 'api'],
    });

    expect(profile.touches).toContain('database');
    expect(profile.touches).toContain('api');
    expect(profile.technologies).toContain('sql');
  });

  it('extracts auth touches', () => {
    const profile = extractTaskProfileFromIssue({
      title: 'Implement OAuth login',
      description: 'Add OAuth2 authentication with JWT tokens',
      labels: ['auth'],
    });

    expect(profile.touches).toContain('auth');
    expect(profile.taskTypes).toContain('auth');
  });

  it('extracts multiple touches', () => {
    const profile = extractTaskProfileFromIssue({
      title: 'Add Redis caching for user API',
      description: 'Cache user queries in Redis with TTL',
      labels: ['performance'],
    });

    expect(profile.touches).toContain('caching');
    expect(profile.touches).toContain('api');
    expect(profile.technologies).toContain('redis');
  });

  it('calculates confidence based on extraction', () => {
    const richProfile = extractTaskProfileFromIssue({
      title: 'Add PostgreSQL user search with Redis caching',
      description: 'Implement API endpoint with database query and caching',
      labels: ['api', 'database', 'caching'],
    });

    const sparseProfile = extractTaskProfileFromIssue({
      title: 'Fix bug',
      description: 'Something is broken',
      labels: [],
    });

    expect(richProfile.confidence).toBeGreaterThan(sparseProfile.confidence);
  });

  it('returns minimum confidence for sparse input', () => {
    const profile = extractTaskProfileFromIssue({
      title: 'Misc task',
      description: 'Do something',
      labels: [],
    });

    expect(profile.confidence).toBeGreaterThanOrEqual(0.3);
  });
});

describe('extractTaskProfileFromContextPack', () => {
  it('uses explicit taskProfile when provided', () => {
    const profile = extractTaskProfileFromContextPack({
      taskProfile: {
        touches: ['database', 'auth'],
        technologies: ['postgres', 'jwt'],
        taskTypes: ['backend', 'api'],
        confidence: 0.85,
      },
    });

    expect(profile.touches).toContain('database');
    expect(profile.touches).toContain('auth');
    expect(profile.technologies).toContain('postgres');
    expect(profile.confidence).toBe(0.85);
  });

  it('infers from constraints when no explicit profile', () => {
    const profile = extractTaskProfileFromContextPack({
      constraintsExtracted: [
        {
          constraint: 'All database queries must use parameterized statements',
          source: { type: 'file', path: 'ARCHITECTURE.md' },
        },
        {
          constraint: 'JWT tokens must be validated on every request',
          source: { type: 'linear_doc', url: 'https://linear.app/docs/auth' },
        },
      ],
    });

    expect(profile.touches).toContain('database');
    expect(profile.touches).toContain('auth');
    expect(profile.confidence).toBe(0.6); // Lower confidence for inference
  });
});

describe('extractTouches', () => {
  it('extracts user_input touch', () => {
    expect(extractTouches('handle user input validation')).toContain('user_input');
    expect(extractTouches('request body parsing')).toContain('user_input');
  });

  it('extracts database touch', () => {
    expect(extractTouches('execute SQL query')).toContain('database');
    expect(extractTouches('postgres connection')).toContain('database');
  });

  it('extracts auth touch', () => {
    expect(extractTouches('authenticate user with JWT')).toContain('auth');
    expect(extractTouches('login with OAuth')).toContain('auth');
  });

  it('extracts authz touch', () => {
    expect(extractTouches('check permissions')).toContain('authz');
    expect(extractTouches('RBAC authorization')).toContain('authz');
  });

  it('extracts caching touch', () => {
    expect(extractTouches('cache response in Redis')).toContain('caching');
    expect(extractTouches('TTL invalidation')).toContain('caching');
  });
});

describe('extractTechnologies', () => {
  it('extracts database technologies', () => {
    expect(extractTechnologies('use postgresql database')).toContain('postgres');
    expect(extractTechnologies('mysql connection pool')).toContain('mysql');
    expect(extractTechnologies('mongodb document store')).toContain('mongodb');
  });

  it('extracts api technologies', () => {
    expect(extractTechnologies('graphql endpoint')).toContain('graphql');
    expect(extractTechnologies('rest api')).toContain('rest');
  });

  it('extracts runtime technologies', () => {
    expect(extractTechnologies('nodejs backend')).toContain('nodejs');
    expect(extractTechnologies('typescript project')).toContain('typescript');
  });
});

describe('extractTaskTypes', () => {
  it('extracts api task type', () => {
    expect(extractTaskTypes('add new endpoint')).toContain('api');
    expect(extractTaskTypes('create route handler')).toContain('api');
  });

  it('extracts migration task type', () => {
    expect(extractTaskTypes('database migration')).toContain('migration');
    expect(extractTaskTypes('schema change')).toContain('migration');
  });

  it('extracts auth task type', () => {
    expect(extractTaskTypes('implement login')).toContain('auth');
    expect(extractTaskTypes('add signup flow')).toContain('auth');
  });

  it('extracts bugfix task type', () => {
    expect(extractTaskTypes('fix bug in checkout')).toContain('bugfix');
    expect(extractTaskTypes('hotfix for production')).toContain('bugfix');
  });
});
