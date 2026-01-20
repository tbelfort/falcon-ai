/**
 * Unit tests for Tagging Miss Checker.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { checkForTaggingMisses } from '../../src/workflow/tagging-miss-checker.js';
import type { PRReviewResult } from '../../src/workflow/pr-review-hook.js';
import type { AttributionResult } from '../../src/attribution/orchestrator.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import { InjectionLogRepository } from '../../src/storage/repositories/injection-log.repo.js';
import { TaggingMissRepository } from '../../src/storage/repositories/tagging-miss.repo.js';
import type { PatternDefinition, EvidenceBundle, DocFingerprint } from '../../src/schemas/index.js';

describe('checkForTaggingMisses', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  const mockFingerprint: DocFingerprint = {
    kind: 'linear',
    docId: 'doc-123',
    updatedAt: new Date().toISOString(),
    contentHash: '0'.repeat(64),
  };

  const mockEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Test quote',
    carrierQuoteType: 'verbatim',
    carrierInstructionKind: 'explicitly_harmful',
    carrierLocation: 'Section 4.2',
    hasCitation: false,
    citedSources: [],
    sourceRetrievable: false,
    sourceAgreesWithCarrier: null,
    mandatoryDocMissing: false,
    vaguenessSignals: [],
    hasTestableAcceptanceCriteria: true,
    conflictSignals: [],
  };

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);

    // Create workspace and project
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

  it('detects tagging miss when pattern not injected due to touch mismatch', async () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const injectionLogRepo = new InjectionLogRepository(db);
    const taggingMissRepo = new TaggingMissRepository(db);

    // Create a pattern that requires 'caching' touch with no overlap on other fields
    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Cache invalidation issue',
      failureMode: 'incomplete',
      findingCategory: 'correctness',
      severity: 'HIGH',
      alternative: 'Use proper cache invalidation',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: ['redis'],
      taskTypes: ['infrastructure'], // Different from taskProfile's ['api']
      touches: ['caching'],
      status: 'active',
      permanent: false,
    });

    // Create injection log with different touches (no 'caching')
    injectionLogRepo.create({
      workspaceId,
      projectId,
      issueId: 'TEST-123',
      target: 'context-pack',
      injectedPatterns: [], // Pattern was NOT injected
      injectedPrinciples: [],
      injectedAlerts: [],
      taskProfile: {
        touches: ['database', 'api'], // Does NOT include 'caching'
        technologies: ['postgres'],
        taskTypes: ['api'],
        confidence: 0.8,
      },
    });

    const prResult: PRReviewResult = {
      workspaceId,
      projectId,
      prNumber: 1,
      issueId: 'TEST-123',
      confirmedFindings: [],
    };

    // Attribution result shows a pattern was attributed but not injected
    const attributionResults: AttributionResult[] = [
      {
        type: 'pattern',
        pattern: pattern as PatternDefinition,
        occurrence: {
          id: 'occ-1',
          patternId: pattern.id,
          workspaceId,
          projectId,
          findingId: 'finding-1',
          issueId: 'TEST-123',
          prNumber: 1,
          severity: 'HIGH',
          evidence: mockEvidence,
          carrierFingerprint: mockFingerprint,
          provenanceChain: [mockFingerprint],
          carrierExcerptHash: '0'.repeat(64),
          wasInjected: false,
          wasAdheredTo: null,
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      },
    ];

    const missCount = await checkForTaggingMisses(db, prResult, attributionResults);

    expect(missCount).toBe(1);

    // Verify tagging miss was created
    const misses = taggingMissRepo.findPending({ workspaceId, projectId });
    expect(misses).toHaveLength(1);
    expect(misses[0].patternId).toBe(pattern.id);
    expect(misses[0].missingTags).toContain('touch:caching');
  });

  it('does not create miss when pattern was injected', async () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const injectionLogRepo = new InjectionLogRepository(db);
    const taggingMissRepo = new TaggingMissRepository(db);

    // Create pattern
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

    // Create injection log showing pattern WAS injected
    injectionLogRepo.create({
      workspaceId,
      projectId,
      issueId: 'TEST-123',
      target: 'context-pack',
      injectedPatterns: [pattern.id], // Pattern WAS injected
      injectedPrinciples: [],
      injectedAlerts: [],
      taskProfile: {
        touches: ['database'],
        technologies: ['sql'],
        taskTypes: ['api'],
        confidence: 0.8,
      },
    });

    const prResult: PRReviewResult = {
      workspaceId,
      projectId,
      prNumber: 1,
      issueId: 'TEST-123',
      confirmedFindings: [],
    };

    const attributionResults: AttributionResult[] = [
      {
        type: 'pattern',
        pattern: pattern as PatternDefinition,
        occurrence: {
          id: 'occ-1',
          patternId: pattern.id,
          workspaceId,
          projectId,
          findingId: 'finding-1',
          issueId: 'TEST-123',
          prNumber: 1,
          severity: 'HIGH',
          evidence: mockEvidence,
          carrierFingerprint: mockFingerprint,
          provenanceChain: [mockFingerprint],
          carrierExcerptHash: '0'.repeat(64),
          wasInjected: true,
          wasAdheredTo: false,
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      },
    ];

    const missCount = await checkForTaggingMisses(db, prResult, attributionResults);

    expect(missCount).toBe(0);

    // Verify no tagging miss was created
    const misses = taggingMissRepo.findPending({ workspaceId, projectId });
    expect(misses).toHaveLength(0);
  });

  it('returns 0 when no injection logs exist', async () => {
    const prResult: PRReviewResult = {
      workspaceId,
      projectId,
      prNumber: 1,
      issueId: 'TEST-999',
      confirmedFindings: [],
    };

    const missCount = await checkForTaggingMisses(db, prResult, []);

    expect(missCount).toBe(0);
  });

  it('skips non-pattern attribution results', async () => {
    const injectionLogRepo = new InjectionLogRepository(db);

    injectionLogRepo.create({
      workspaceId,
      projectId,
      issueId: 'TEST-123',
      target: 'context-pack',
      injectedPatterns: [],
      injectedPrinciples: [],
      injectedAlerts: [],
      taskProfile: {
        touches: ['database'],
        technologies: ['sql'],
        taskTypes: ['api'],
        confidence: 0.8,
      },
    });

    const prResult: PRReviewResult = {
      workspaceId,
      projectId,
      prNumber: 1,
      issueId: 'TEST-123',
      confirmedFindings: [],
    };

    const attributionResults: AttributionResult[] = [
      { type: 'noncompliance' },
      { type: 'doc_update_only' },
      { type: 'skipped' },
    ];

    const missCount = await checkForTaggingMisses(db, prResult, attributionResults);

    expect(missCount).toBe(0);
  });
});
