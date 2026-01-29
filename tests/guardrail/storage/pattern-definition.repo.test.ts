/**
 * Tests for PatternDefinitionRepository.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PatternDefinitionRepository } from '../../../src/guardrail/storage/repositories/pattern-definition.repo.js';

describe('PatternDefinitionRepository', () => {
  let db: Database.Database;
  let repo: PatternDefinitionRepository;

  // Test scope constants
  const testScope = {
    level: 'project' as const,
    workspaceId: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
  };

  beforeEach(() => {
    db = new Database(':memory:');
    // Create minimal schema for testing
    db.exec(`
      CREATE TABLE pattern_definitions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        pattern_content TEXT NOT NULL,
        failure_mode TEXT NOT NULL,
        finding_category TEXT NOT NULL,
        severity TEXT NOT NULL,
        severity_max TEXT NOT NULL,
        alternative TEXT NOT NULL,
        consequence_class TEXT,
        carrier_stage TEXT NOT NULL,
        primary_carrier_quote_type TEXT NOT NULL,
        technologies TEXT NOT NULL DEFAULT '[]',
        task_types TEXT NOT NULL DEFAULT '[]',
        touches TEXT NOT NULL DEFAULT '[]',
        aligned_baseline_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        permanent INTEGER NOT NULL DEFAULT 0,
        superseded_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_patterns_scope_key
        ON pattern_definitions(workspace_id, project_id, pattern_key);
    `);
    repo = new PatternDefinitionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and retrieves pattern with patternKey and scope', () => {
    const created = repo.create({
      scope: testScope,
      patternContent: 'Use template literals for SQL',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Use parameterized queries',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: ['sql'],
      taskTypes: ['api'],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    expect(created.id).toBeDefined();
    expect(created.patternKey).toHaveLength(64);
    expect(created.severityMax).toBe('HIGH');
    expect(created.scope).toEqual(testScope);

    const retrieved = repo.findById(created.id);
    expect(retrieved).toEqual(created);
  });

  it('deduplicates by patternKey within same scope and updates severityMax', () => {
    const first = repo.create({
      scope: testScope,
      patternContent: 'Duplicate content',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'MEDIUM',
      alternative: 'Fix it',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    // Same content, same stage, same category, same scope = same patternKey
    const second = repo.create({
      scope: testScope,
      patternContent: 'Duplicate content',
      failureMode: 'incomplete', // Different mode won't matter
      findingCategory: 'security',
      severity: 'CRITICAL', // Higher severity
      alternative: 'Different alternative',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'inferred',
      technologies: ['postgres'],
      taskTypes: ['database'],
      touches: ['database'],
      status: 'active',
      permanent: true,
    });

    // Should return same pattern with updated severityMax
    expect(second.id).toBe(first.id);
    expect(second.patternKey).toBe(first.patternKey);
    expect(second.severityMax).toBe('CRITICAL'); // Updated!
  });

  it('allows same patternKey in different projects', () => {
    const otherProjectScope = {
      level: 'project' as const,
      workspaceId: testScope.workspaceId,
      projectId: '33333333-3333-3333-3333-333333333333', // Different project
    };

    const first = repo.create({
      scope: testScope,
      patternContent: 'Same content',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    const second = repo.create({
      scope: otherProjectScope, // Different project
      patternContent: 'Same content',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    // Same patternKey but different IDs (different projects)
    expect(second.patternKey).toBe(first.patternKey);
    expect(second.id).not.toBe(first.id);
  });

  it('findActive filters by scope', () => {
    const otherProjectScope = {
      level: 'project' as const,
      workspaceId: testScope.workspaceId,
      projectId: '33333333-3333-3333-3333-333333333333',
    };

    repo.create({
      scope: testScope,
      patternContent: 'Pattern in project A',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    repo.create({
      scope: otherProjectScope,
      patternContent: 'Pattern in project B',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    // Should only return patterns from testScope
    const results = repo.findActive({
      workspaceId: testScope.workspaceId,
      projectId: testScope.projectId,
    });
    expect(results).toHaveLength(1);
    expect(results[0].patternContent).toBe('Pattern in project A');
  });

  it('findCrossProject returns patterns from other projects', () => {
    const otherProjectScope = {
      level: 'project' as const,
      workspaceId: testScope.workspaceId,
      projectId: '33333333-3333-3333-3333-333333333333',
    };

    repo.create({
      scope: testScope,
      patternContent: 'Pattern in project A',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    repo.create({
      scope: otherProjectScope,
      patternContent: 'Pattern in project B',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'CRITICAL',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    // Should return patterns from other projects only
    const results = repo.findCrossProject({
      workspaceId: testScope.workspaceId,
      excludeProjectId: testScope.projectId,
      minSeverity: 'HIGH',
    });
    expect(results).toHaveLength(1);
    expect(results[0].patternContent).toBe('Pattern in project B');
  });

  it('findByTouches filters correctly', () => {
    repo.create({
      scope: testScope,
      patternContent: 'Database pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['database', 'user_input'],
      status: 'active',
      permanent: false,
    });

    repo.create({
      scope: testScope,
      patternContent: 'Network pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['network'],
      status: 'active',
      permanent: false,
    });

    const databasePatterns = repo.findByTouches(
      { workspaceId: testScope.workspaceId, projectId: testScope.projectId },
      ['database']
    );
    expect(databasePatterns).toHaveLength(1);
    expect(databasePatterns[0].patternContent).toBe('Database pattern');

    const networkPatterns = repo.findByTouches(
      { workspaceId: testScope.workspaceId, projectId: testScope.projectId },
      ['network']
    );
    expect(networkPatterns).toHaveLength(1);
    expect(networkPatterns[0].patternContent).toBe('Network pattern');
  });

  it('update preserves immutable fields', () => {
    const created = repo.create({
      scope: testScope,
      patternContent: 'Original content',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    const updated = repo.update(created.id, {
      alternative: 'New alternative',
      status: 'archived',
    });

    expect(updated).not.toBeNull();
    expect(updated!.patternContent).toBe('Original content'); // Immutable
    expect(updated!.patternKey).toBe(created.patternKey); // Immutable
    expect(updated!.contentHash).toBe(created.contentHash); // Immutable
    expect(updated!.alternative).toBe('New alternative'); // Updated
    expect(updated!.status).toBe('archived'); // Updated
  });

  it('archive sets status to archived', () => {
    const created = repo.create({
      scope: testScope,
      patternContent: 'To be archived',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    const result = repo.archive(created.id);
    expect(result).toBe(true);

    const retrieved = repo.findById(created.id);
    expect(retrieved!.status).toBe('archived');
  });
});
