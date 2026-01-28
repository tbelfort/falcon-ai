/**
 * Unit tests for TaskProfile Validator.
 */

import { describe, it, expect } from 'vitest';
import {
  validateTaskProfile,
  extractConstraintsFromMetadata,
} from '../../../src/guardrail/injection/task-profile-validator.js';
import type { TaskProfile } from '../../../src/guardrail/schemas/index.js';

describe('validateTaskProfile', () => {
  const baseProfile: TaskProfile = {
    touches: ['api'],
    technologies: ['typescript'],
    taskTypes: ['feature'],
    confidence: 0.8,
  };

  describe('database touch detection', () => {
    it('adds database touch when constraints mention SQL', () => {
      const result = validateTaskProfile(baseProfile, ['Use SQL queries for data access']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('database');
      expect(result.taskProfile.touches).toContain('database');
    });

    it('adds database touch when constraints mention postgres', () => {
      const result = validateTaskProfile(baseProfile, ['Connect to postgres database']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('database');
    });

    it('adds database touch when constraints mention query', () => {
      const result = validateTaskProfile(baseProfile, ['Execute query against db']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('database');
    });

    it('does not add database if already present', () => {
      const profileWithDb: TaskProfile = {
        ...baseProfile,
        touches: ['api', 'database'],
      };

      const result = validateTaskProfile(profileWithDb, ['Use SQL for data']);

      expect(result.wasAutoCorrected).toBe(false);
      expect(result.addedTouches).toHaveLength(0);
    });
  });

  describe('authz touch detection', () => {
    it('adds authz touch when constraints mention permissions', () => {
      const result = validateTaskProfile(baseProfile, ['Check user permissions']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('authz');
      expect(result.taskProfile.touches).toContain('authz');
    });

    it('adds authz touch when constraints mention roles', () => {
      const result = validateTaskProfile(baseProfile, ['Enforce roles for access']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('authz');
    });

    it('adds authz touch when constraints mention RBAC', () => {
      const result = validateTaskProfile(baseProfile, ['Implement RBAC system']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('authz');
    });

    it('adds authz touch when constraints mention authorization', () => {
      const result = validateTaskProfile(baseProfile, ['Authorization is required']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('authz');
    });
  });

  describe('network touch detection', () => {
    it('adds network touch when constraints mention HTTP', () => {
      const result = validateTaskProfile(baseProfile, ['Make HTTP calls to service']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('network');
      expect(result.taskProfile.touches).toContain('network');
    });

    it('adds network touch when constraints mention API', () => {
      const result = validateTaskProfile(baseProfile, ['Call external API']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('network');
    });

    it('adds network touch when constraints mention webhook', () => {
      const result = validateTaskProfile(baseProfile, ['Send webhook notification']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('network');
    });

    it('adds network touch when constraints mention REST', () => {
      const result = validateTaskProfile(baseProfile, ['Use REST endpoints']);

      expect(result.wasAutoCorrected).toBe(true);
      expect(result.addedTouches).toContain('network');
    });
  });

  describe('confidence adjustment', () => {
    it('reduces confidence by 0.1 per auto-corrected touch', () => {
      const result = validateTaskProfile(baseProfile, ['Use SQL queries']);

      expect(result.originalConfidence).toBe(0.8);
      expect(result.taskProfile.confidence).toBeCloseTo(0.7, 5);
    });

    it('reduces confidence by 0.2 for two auto-corrected touches', () => {
      const result = validateTaskProfile(baseProfile, [
        'Use SQL queries and check permissions',
      ]);

      expect(result.addedTouches).toHaveLength(2);
      expect(result.taskProfile.confidence).toBeCloseTo(0.6, 5);
    });

    it('floors confidence at 0.5', () => {
      const result = validateTaskProfile(baseProfile, [
        'SQL database with permissions and HTTP calls',
      ]);

      expect(result.addedTouches).toHaveLength(3);
      expect(result.taskProfile.confidence).toBe(0.5); // 0.8 - 0.3 = 0.5
    });

    it('does not reduce confidence if no corrections made', () => {
      const profileWithAll: TaskProfile = {
        ...baseProfile,
        touches: ['api', 'database', 'authz', 'network'],
      };

      const result = validateTaskProfile(profileWithAll, [
        'SQL database with permissions and HTTP',
      ]);

      expect(result.wasAutoCorrected).toBe(false);
      expect(result.taskProfile.confidence).toBe(0.8);
    });
  });

  describe('multiple constraints', () => {
    it('checks all constraints for touch patterns', () => {
      const result = validateTaskProfile(baseProfile, [
        'First constraint with postgres',
        'Second constraint with nothing',
        'Third constraint with permissions',
      ]);

      expect(result.addedTouches).toContain('database');
      expect(result.addedTouches).toContain('authz');
    });
  });

  describe('case insensitivity', () => {
    it('matches patterns case-insensitively', () => {
      const result = validateTaskProfile(baseProfile, ['SQL', 'POSTGRES', 'DATABASE']);

      expect(result.addedTouches).toContain('database');
    });
  });
});

describe('extractConstraintsFromMetadata', () => {
  it('extracts constraint text from metadata', () => {
    const metadata = {
      constraintsExtracted: [
        { constraint: 'Must use parameterized queries' },
        { constraint: 'Validate all user input' },
      ],
    };

    const constraints = extractConstraintsFromMetadata(metadata);

    expect(constraints).toEqual([
      'Must use parameterized queries',
      'Validate all user input',
    ]);
  });

  it('returns empty array when no constraints', () => {
    const metadata = {};
    const constraints = extractConstraintsFromMetadata(metadata);

    expect(constraints).toEqual([]);
  });

  it('returns empty array when constraintsExtracted is undefined', () => {
    const metadata = { constraintsExtracted: undefined };
    const constraints = extractConstraintsFromMetadata(metadata);

    expect(constraints).toEqual([]);
  });
});
