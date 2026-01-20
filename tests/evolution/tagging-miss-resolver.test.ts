/**
 * Unit tests for Tagging Miss Resolver.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  analyzeTaggingMisses,
  resolveTaggingMiss,
  getTaggingMissSummary,
  countOccurrences,
} from '../../src/evolution/tagging-miss-resolver.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import { TaggingMissRepository } from '../../src/storage/repositories/tagging-miss.repo.js';

describe('analyzeTaggingMisses', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);

    const workspaceRepo = new WorkspaceRepository(db);
    const projectRepo = new ProjectRepository(db);

    const workspace = workspaceRepo.create({
      name: 'Test Workspace',
      slug: 'test-workspace',
      config: {},
      status: 'active',
    });
    workspaceId = workspace.id;

    const project = projectRepo.create({
      workspaceId,
      name: 'Test Project',
      repoOriginUrl: 'https://github.com/test/repo',
      config: {},
      status: 'active',
    });
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
  });

  it('groups pending misses by pattern', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const taggingMissRepo = new TaggingMissRepository(db);

    // Create two patterns
    const pattern1 = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Pattern 1',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: ['sql'],
      taskTypes: ['api'],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    const pattern2 = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Pattern 2',
      failureMode: 'incomplete',
      findingCategory: 'correctness',
      severity: 'MEDIUM',
      alternative: 'Another approach',
      carrierStage: 'spec',
      primaryCarrierQuoteType: 'paraphrase',
      technologies: ['nodejs'],
      taskTypes: ['backend'],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    // Create misses for pattern 1
    taggingMissRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      patternId: pattern1.id,
      actualTaskProfile: {
        touches: ['network'],
        technologies: ['http'],
        taskTypes: ['frontend'],
        confidence: 0.8,
      },
      requiredMatch: {
        touches: ['database'],
        technologies: ['sql'],
      },
      missingTags: ['touch:database', 'tech:sql'],
      status: 'pending',
    });

    taggingMissRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-2',
      patternId: pattern1.id,
      actualTaskProfile: {
        touches: ['api'],
        technologies: ['graphql'],
        taskTypes: ['api'],
        confidence: 0.9,
      },
      requiredMatch: {
        touches: ['database'],
      },
      missingTags: ['touch:database'],
      status: 'pending',
    });

    // Create miss for pattern 2
    taggingMissRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-3',
      patternId: pattern2.id,
      actualTaskProfile: {
        touches: ['database'],
        technologies: ['postgres'],
        taskTypes: ['database'],
        confidence: 0.7,
      },
      requiredMatch: {
        touches: ['api'],
        technologies: ['nodejs'],
      },
      missingTags: ['touch:api', 'tech:nodejs'],
      status: 'pending',
    });

    const result = analyzeTaggingMisses(db, workspaceId, projectId);

    expect(result.totalPending).toBe(3);
    expect(result.byPattern.size).toBe(2);
    expect(result.byPattern.get(pattern1.id)?.length).toBe(2);
    expect(result.byPattern.get(pattern2.id)?.length).toBe(1);
  });

  it('computes frequent missing tags', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const taggingMissRepo = new TaggingMissRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Test pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: ['sql', 'postgres'],
      taskTypes: ['api'],
      touches: ['database', 'user_input'],
      status: 'active',
      permanent: false,
    });

    // Create multiple misses with overlapping missing tags
    for (let i = 0; i < 3; i++) {
      taggingMissRepo.create({
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        patternId: pattern.id,
        actualTaskProfile: {
          touches: ['network'],
          technologies: ['http'],
          taskTypes: ['frontend'],
          confidence: 0.8,
        },
        requiredMatch: {
          touches: ['database'],
        },
        missingTags: ['touch:database'], // Same tag missing 3 times
        status: 'pending',
      });
    }

    const result = analyzeTaggingMisses(db, workspaceId, projectId);

    expect(result.frequentMissingTags.get('touch:database')).toBe(3);
  });

  it('generates broaden_pattern suggestions for missing touches', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const taggingMissRepo = new TaggingMissRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'SQL injection pattern',
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

    taggingMissRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      patternId: pattern.id,
      actualTaskProfile: {
        touches: ['user_input', 'network'],
        technologies: ['http'],
        taskTypes: ['api'],
        confidence: 0.85,
      },
      requiredMatch: {
        touches: ['database'],
      },
      missingTags: ['touch:database'],
      status: 'pending',
    });

    const result = analyzeTaggingMisses(db, workspaceId, projectId);

    const suggestions = result.byPattern.get(pattern.id);
    expect(suggestions).toBeDefined();
    expect(suggestions!.length).toBe(1);

    const patternSuggestions = suggestions![0].suggestions;

    // Should have broaden_pattern suggestion
    const broadenSuggestion = patternSuggestions.find((s) => s.action === 'broaden_pattern');
    expect(broadenSuggestion).toBeDefined();
    expect(broadenSuggestion?.changes?.touches).toBeDefined();

    // Should also have improve_extraction and false_positive options
    expect(patternSuggestions.some((s) => s.action === 'improve_extraction')).toBe(true);
    expect(patternSuggestions.some((s) => s.action === 'false_positive')).toBe(true);
  });

  it('returns empty result when no pending misses', () => {
    const result = analyzeTaggingMisses(db, workspaceId, projectId);

    expect(result.totalPending).toBe(0);
    expect(result.byPattern.size).toBe(0);
    expect(result.frequentMissingTags.size).toBe(0);
  });
});

describe('resolveTaggingMiss', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);

    const workspaceRepo = new WorkspaceRepository(db);
    const projectRepo = new ProjectRepository(db);

    const workspace = workspaceRepo.create({
      name: 'Test Workspace',
      slug: 'test-workspace',
      config: {},
      status: 'active',
    });
    workspaceId = workspace.id;

    const project = projectRepo.create({
      workspaceId,
      name: 'Test Project',
      repoOriginUrl: 'https://github.com/test/repo',
      config: {},
      status: 'active',
    });
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
  });

  it('applies pattern changes when broadening', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const taggingMissRepo = new TaggingMissRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Test pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: ['sql'],
      taskTypes: ['api'],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    const miss = taggingMissRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      patternId: pattern.id,
      actualTaskProfile: {
        touches: ['user_input', 'network'],
        technologies: ['http'],
        taskTypes: ['api'],
        confidence: 0.85,
      },
      requiredMatch: {
        touches: ['database'],
      },
      missingTags: ['touch:database'],
      status: 'pending',
    });

    const result = resolveTaggingMiss(db, miss.id, 'broadened_pattern', {
      touches: ['database', 'user_input', 'network'],
    });

    expect(result.success).toBe(true);
    expect(result.resolution).toBe('broadened_pattern');
    expect(result.patternUpdated).toBe(true);

    // Verify pattern was updated
    const updatedPattern = patternRepo.findById(pattern.id);
    expect(updatedPattern?.touches).toContain('user_input');
    expect(updatedPattern?.touches).toContain('network');

    // Verify miss was resolved
    const updatedMiss = taggingMissRepo.findById(miss.id);
    expect(updatedMiss?.status).toBe('resolved');
    expect(updatedMiss?.resolution).toBe('broadened_pattern');
  });

  it('marks miss as resolved without pattern changes for false_positive', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const taggingMissRepo = new TaggingMissRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Test pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    const miss = taggingMissRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      patternId: pattern.id,
      actualTaskProfile: {
        touches: ['network'],
        technologies: [],
        taskTypes: [],
        confidence: 0.7,
      },
      requiredMatch: {
        touches: ['database'],
      },
      missingTags: ['touch:database'],
      status: 'pending',
    });

    const result = resolveTaggingMiss(db, miss.id, 'false_positive');

    expect(result.success).toBe(true);
    expect(result.resolution).toBe('false_positive');
    expect(result.patternUpdated).toBe(false);

    const updatedMiss = taggingMissRepo.findById(miss.id);
    expect(updatedMiss?.status).toBe('resolved');
    expect(updatedMiss?.resolution).toBe('false_positive');
  });

  it('returns failure for non-existent miss', () => {
    const result = resolveTaggingMiss(db, 'non-existent-id', 'false_positive');

    expect(result.success).toBe(false);
    expect(result.patternUpdated).toBe(false);
  });
});

describe('getTaggingMissSummary', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);

    const workspaceRepo = new WorkspaceRepository(db);
    const projectRepo = new ProjectRepository(db);

    const workspace = workspaceRepo.create({
      name: 'Test Workspace',
      slug: 'test-workspace',
      config: {},
      status: 'active',
    });
    workspaceId = workspace.id;

    const project = projectRepo.create({
      workspaceId,
      name: 'Test Project',
      repoOriginUrl: 'https://github.com/test/repo',
      config: {},
      status: 'active',
    });
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
  });

  it('returns correct counts', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const taggingMissRepo = new TaggingMissRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Test pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    // Create pending misses
    for (let i = 0; i < 3; i++) {
      taggingMissRepo.create({
        workspaceId,
        projectId,
        findingId: `finding-pending-${i}`,
        patternId: pattern.id,
        actualTaskProfile: {
          touches: ['network'],
          technologies: [],
          taskTypes: [],
          confidence: 0.8,
        },
        requiredMatch: { touches: ['database'] },
        missingTags: ['touch:database'],
        status: 'pending',
      });
    }

    // Create resolved misses
    const resolvedMiss1 = taggingMissRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-resolved-1',
      patternId: pattern.id,
      actualTaskProfile: {
        touches: ['api'],
        technologies: [],
        taskTypes: [],
        confidence: 0.9,
      },
      requiredMatch: { touches: ['database'] },
      missingTags: ['touch:database'],
      status: 'pending',
    });
    taggingMissRepo.resolve({ id: resolvedMiss1.id, resolution: 'broadened_pattern' });

    const resolvedMiss2 = taggingMissRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-resolved-2',
      patternId: pattern.id,
      actualTaskProfile: {
        touches: ['caching'],
        technologies: [],
        taskTypes: [],
        confidence: 0.7,
      },
      requiredMatch: { touches: ['database'] },
      missingTags: ['touch:database'],
      status: 'pending',
    });
    taggingMissRepo.resolve({ id: resolvedMiss2.id, resolution: 'false_positive' });

    const summary = getTaggingMissSummary(db, workspaceId, projectId);

    expect(summary.pending).toBe(3);
    expect(summary.resolved).toBe(2);
    expect(summary.byResolution.get('broadened_pattern')).toBe(1);
    expect(summary.byResolution.get('false_positive')).toBe(1);
  });
});

describe('countOccurrences', () => {
  it('counts occurrences correctly', () => {
    const result = countOccurrences(['a', 'b', 'a', 'c', 'a', 'b']);

    expect(result.get('a')).toBe(3);
    expect(result.get('b')).toBe(2);
    expect(result.get('c')).toBe(1);
  });

  it('returns empty map for empty array', () => {
    const result = countOccurrences([]);

    expect(result.size).toBe(0);
  });
});
