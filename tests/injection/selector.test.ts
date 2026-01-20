/**
 * Tests for the tiered warning selector.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  selectWarningsForInjection,
  getCategoryPrecedence,
  resolveConflicts,
  type InjectedWarning,
} from '../../src/injection/selector.js';
import { initializeDatabase } from '../../src/storage/db.js';
import type { TaskProfile, Touch, PatternDefinition, DerivedPrinciple } from '../../src/schemas/index.js';

describe('selector', () => {
  let db: Database.Database;
  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const projectId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);

    // Create workspace
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO workspaces (id, name, slug, config, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(workspaceId, 'Test Workspace', 'test-workspace', '{}', 'active', now, now);

    // Create project
    db.prepare(`
      INSERT INTO projects (id, workspace_id, name, repo_origin_url, config, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(projectId, workspaceId, 'Test Project', 'https://github.com/test/repo', '{}', 'active', now, now);
  });

  afterEach(() => {
    db.close();
  });

  describe('selectWarningsForInjection', () => {
    const baseTaskProfile: TaskProfile = {
      touches: ['database', 'api'] as Touch[],
      technologies: ['sql', 'node'],
      taskTypes: ['api'],
      confidence: 0.8,
    };

    it('returns empty result for archived project', () => {
      db.prepare(`UPDATE projects SET status = 'archived' WHERE id = ?`).run(projectId);

      const result = selectWarningsForInjection(db, {
        workspaceId,
        projectId,
        target: 'context-pack',
        taskProfile: baseTaskProfile,
      });

      expect(result.warnings).toHaveLength(0);
      expect(result.alerts).toHaveLength(0);
    });

    it('returns empty result when no patterns exist', () => {
      const result = selectWarningsForInjection(db, {
        workspaceId,
        projectId,
        target: 'context-pack',
        taskProfile: baseTaskProfile,
      });

      expect(result.warnings).toHaveLength(0);
      expect(result.alerts).toHaveLength(0);
    });

    it('selects baseline principles based on touch overlap', () => {
      const now = new Date().toISOString();

      // Create baseline principle with matching touches
      db.prepare(`
        INSERT INTO derived_principles (
          id, workspace_id, principle, rationale, origin, inject_into,
          touches, confidence, status, permanent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'baseline-1',
        workspaceId,
        'Always use parameterized queries',
        'Prevents SQL injection',
        'baseline',
        'context-pack',
        JSON.stringify(['database']),
        0.9,
        'active',
        0,
        now,
        now
      );

      const result = selectWarningsForInjection(db, {
        workspaceId,
        projectId,
        target: 'context-pack',
        taskProfile: baseTaskProfile,
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('principle');
      expect((result.warnings[0].content as DerivedPrinciple).principle).toBe('Always use parameterized queries');
    });

    it('respects maxWarnings limit', () => {
      const now = new Date().toISOString();

      // Create many patterns
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO pattern_definitions (
            id, workspace_id, project_id, pattern_key, content_hash,
            pattern_content, failure_mode, finding_category, severity, severity_max,
            alternative, carrier_stage, primary_carrier_quote_type,
            technologies, task_types, touches, status, permanent, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `pattern-${i}`,
          workspaceId,
          projectId,
          `key-${i}`,
          `hash-${i}`,
          `Pattern content ${i}`,
          'incorrect',
          'correctness',
          'MEDIUM',
          'MEDIUM',
          'Do this instead',
          'context-pack',
          'verbatim',
          JSON.stringify(['sql']),
          JSON.stringify(['api']),
          JSON.stringify(['database']),
          'active',
          0,
          now,
          now
        );
      }

      const result = selectWarningsForInjection(db, {
        workspaceId,
        projectId,
        target: 'context-pack',
        taskProfile: baseTaskProfile,
        maxWarnings: 3,
      });

      expect(result.warnings.length).toBeLessThanOrEqual(3);
    });

    it('prioritizes security patterns', () => {
      const now = new Date().toISOString();

      // Create security pattern
      db.prepare(`
        INSERT INTO pattern_definitions (
          id, workspace_id, project_id, pattern_key, content_hash,
          pattern_content, failure_mode, finding_category, severity, severity_max,
          alternative, carrier_stage, primary_carrier_quote_type,
          technologies, task_types, touches, status, permanent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'security-pattern',
        workspaceId,
        projectId,
        'security-key',
        'security-hash',
        'Security issue',
        'incorrect',
        'security',
        'HIGH',
        'HIGH',
        'Fix it',
        'context-pack',
        'verbatim',
        JSON.stringify(['sql']),
        JSON.stringify(['api']),
        JSON.stringify(['database']),
        'active',
        0,
        now,
        now
      );

      // Create correctness pattern
      db.prepare(`
        INSERT INTO pattern_definitions (
          id, workspace_id, project_id, pattern_key, content_hash,
          pattern_content, failure_mode, finding_category, severity, severity_max,
          alternative, carrier_stage, primary_carrier_quote_type,
          technologies, task_types, touches, status, permanent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'correctness-pattern',
        workspaceId,
        projectId,
        'correctness-key',
        'correctness-hash',
        'Correctness issue',
        'incorrect',
        'correctness',
        'CRITICAL',
        'CRITICAL',
        'Fix it',
        'context-pack',
        'verbatim',
        JSON.stringify(['sql']),
        JSON.stringify(['api']),
        JSON.stringify(['database']),
        'active',
        0,
        now,
        now
      );

      const result = selectWarningsForInjection(db, {
        workspaceId,
        projectId,
        target: 'context-pack',
        taskProfile: baseTaskProfile,
      });

      // Security should be selected first despite lower severity
      const patternWarnings = result.warnings.filter(w => w.type === 'pattern');
      expect(patternWarnings.length).toBeGreaterThan(0);

      // Find security pattern in results
      const securityWarning = patternWarnings.find(
        w => (w.content as PatternDefinition).findingCategory === 'security'
      );
      expect(securityWarning).toBeDefined();
    });

    it('includes provisional alerts additively', () => {
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // Create active provisional alert
      db.prepare(`
        INSERT INTO provisional_alerts (
          id, workspace_id, project_id, finding_id, issue_id, message,
          touches, inject_into, expires_at, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'alert-1',
        workspaceId,
        projectId,
        'finding-1',
        'issue-1',
        'Critical alert message',
        JSON.stringify(['database']),
        'context-pack',
        future,
        'active',
        now
      );

      const result = selectWarningsForInjection(db, {
        workspaceId,
        projectId,
        target: 'context-pack',
        taskProfile: baseTaskProfile,
      });

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].content.message).toBe('Critical alert message');
    });

    it('filters patterns by target stage', () => {
      const now = new Date().toISOString();

      // Create pattern for context-pack only
      db.prepare(`
        INSERT INTO pattern_definitions (
          id, workspace_id, project_id, pattern_key, content_hash,
          pattern_content, failure_mode, finding_category, severity, severity_max,
          alternative, carrier_stage, primary_carrier_quote_type,
          technologies, task_types, touches, status, permanent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'cp-pattern',
        workspaceId,
        projectId,
        'cp-key',
        'cp-hash',
        'Context pack pattern',
        'incorrect',
        'correctness',
        'HIGH',
        'HIGH',
        'Fix it',
        'context-pack',
        'verbatim',
        JSON.stringify(['sql']),
        JSON.stringify(['api']),
        JSON.stringify(['database']),
        'active',
        0,
        now,
        now
      );

      // Create pattern for spec only
      db.prepare(`
        INSERT INTO pattern_definitions (
          id, workspace_id, project_id, pattern_key, content_hash,
          pattern_content, failure_mode, finding_category, severity, severity_max,
          alternative, carrier_stage, primary_carrier_quote_type,
          technologies, task_types, touches, status, permanent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'spec-pattern',
        workspaceId,
        projectId,
        'spec-key',
        'spec-hash',
        'Spec pattern',
        'incorrect',
        'correctness',
        'HIGH',
        'HIGH',
        'Fix it',
        'spec',
        'verbatim',
        JSON.stringify(['sql']),
        JSON.stringify(['api']),
        JSON.stringify(['database']),
        'active',
        0,
        now,
        now
      );

      const cpResult = selectWarningsForInjection(db, {
        workspaceId,
        projectId,
        target: 'context-pack',
        taskProfile: baseTaskProfile,
      });

      const specResult = selectWarningsForInjection(db, {
        workspaceId,
        projectId,
        target: 'spec',
        taskProfile: baseTaskProfile,
      });

      const cpPatterns = cpResult.warnings
        .filter(w => w.type === 'pattern')
        .map(w => (w.content as PatternDefinition).patternContent);
      const specPatterns = specResult.warnings
        .filter(w => w.type === 'pattern')
        .map(w => (w.content as PatternDefinition).patternContent);

      expect(cpPatterns).toContain('Context pack pattern');
      expect(cpPatterns).not.toContain('Spec pattern');
      expect(specPatterns).toContain('Spec pattern');
      expect(specPatterns).not.toContain('Context pack pattern');
    });
  });

  describe('getCategoryPrecedence', () => {
    it('returns correct precedence for known categories', () => {
      expect(getCategoryPrecedence('security')).toBe(5);
      expect(getCategoryPrecedence('privacy')).toBe(4);
      expect(getCategoryPrecedence('backcompat')).toBe(3);
      expect(getCategoryPrecedence('correctness')).toBe(2);
    });

    it('returns 1 for unknown categories', () => {
      expect(getCategoryPrecedence('unknown')).toBe(1);
      expect(getCategoryPrecedence('testing')).toBe(1);
    });
  });

  describe('resolveConflicts', () => {
    it('keeps higher precedence items in conflict groups', () => {
      const items: InjectedWarning[] = [
        {
          type: 'pattern',
          id: 'p1',
          priority: 0.9,
          content: { findingCategory: 'correctness' } as PatternDefinition,
        },
        {
          type: 'pattern',
          id: 'p2',
          priority: 0.8,
          content: { findingCategory: 'security' } as PatternDefinition,
        },
      ];

      // All items have same conflict key - security should win
      const resolved = resolveConflicts(items, () => 'same-key');

      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe('p2'); // Security has higher precedence
    });

    it('preserves non-conflicting items', () => {
      const items: InjectedWarning[] = [
        {
          type: 'pattern',
          id: 'p1',
          priority: 0.9,
          content: { findingCategory: 'correctness' } as PatternDefinition,
        },
        {
          type: 'pattern',
          id: 'p2',
          priority: 0.8,
          content: { findingCategory: 'security' } as PatternDefinition,
        },
      ];

      // No conflicts - return null for conflict key
      const resolved = resolveConflicts(items, () => null);

      expect(resolved).toHaveLength(2);
    });

    it('handles mixed conflicts and non-conflicts', () => {
      const items: InjectedWarning[] = [
        {
          type: 'pattern',
          id: 'p1',
          priority: 0.9,
          content: { findingCategory: 'correctness' } as PatternDefinition,
        },
        {
          type: 'pattern',
          id: 'p2',
          priority: 0.8,
          content: { findingCategory: 'security' } as PatternDefinition,
        },
        {
          type: 'pattern',
          id: 'p3',
          priority: 0.7,
          content: { findingCategory: 'privacy' } as PatternDefinition,
        },
      ];

      // p1 and p2 conflict, p3 doesn't conflict with anything
      const resolved = resolveConflicts(items, (item) => {
        if (item.id === 'p3') return null;
        return 'conflict-group';
      });

      expect(resolved).toHaveLength(2);
      expect(resolved.map(r => r.id).sort()).toEqual(['p2', 'p3'].sort());
    });
  });
});
