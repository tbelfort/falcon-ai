/**
 * Unit tests for Adherence Updater.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { updateAdherence } from '../../src/workflow/adherence-updater.js';
import type { PRReviewResult, ConfirmedFinding } from '../../src/workflow/pr-review-hook.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../../src/storage/repositories/pattern-occurrence.repo.js';
import { InjectionLogRepository } from '../../src/storage/repositories/injection-log.repo.js';
import type { DocFingerprint, EvidenceBundle } from '../../src/schemas/index.js';

describe('updateAdherence', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;
  let patternId: string;

  const mockFingerprint: DocFingerprint = {
    kind: 'linear',
    docId: 'doc-123',
    updatedAt: new Date().toISOString(),
    contentHash: '0'.repeat(64),
  };

  const mockEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Use string concatenation for SQL',
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

    // Create a test pattern
    const patternRepo = new PatternDefinitionRepository(db);
    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Use string concatenation for SQL queries',
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
    patternId = pattern.id;
  });

  afterEach(() => {
    db.close();
  });

  it('marks occurrence as not adhered to when related finding exists', async () => {
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const injectionLogRepo = new InjectionLogRepository(db);

    // Create injection log showing pattern was injected
    injectionLogRepo.create({
      workspaceId,
      projectId,
      issueId: 'TEST-123',
      target: 'context-pack',
      injectedPatterns: [patternId],
      injectedPrinciples: [],
      injectedAlerts: [],
      taskProfile: {
        touches: ['database'],
        technologies: ['sql'],
        taskTypes: ['api'],
        confidence: 0.8,
      },
    });

    // Create occurrence
    const occurrence = occurrenceRepo.create({
      patternId,
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
      wasAdheredTo: null,
      status: 'active',
    });

    // Finding that relates to the pattern (security category, SQL keywords)
    const finding: ConfirmedFinding = {
      id: 'finding-1',
      scoutType: 'security',
      title: 'SQL Injection vulnerability',
      description: 'Found SQL injection using string concatenation',
      severity: 'HIGH',
      category: 'security',
    };

    const result: PRReviewResult = {
      workspaceId,
      projectId,
      prNumber: 1,
      issueId: 'TEST-123',
      confirmedFindings: [finding],
    };

    const adherenceResult = await updateAdherence(db, result);

    expect(adherenceResult.updated).toBe(1);

    // Verify occurrence was updated
    const updatedOccurrence = occurrenceRepo.findById(occurrence.id);
    expect(updatedOccurrence?.wasAdheredTo).toBe(false);
  });

  it('marks as adhered when no related findings match', async () => {
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const injectionLogRepo = new InjectionLogRepository(db);

    // Create injection log
    injectionLogRepo.create({
      workspaceId,
      projectId,
      issueId: 'TEST-123',
      target: 'context-pack',
      injectedPatterns: [patternId],
      injectedPrinciples: [],
      injectedAlerts: [],
      taskProfile: {
        touches: ['database'],
        technologies: ['sql'],
        taskTypes: ['api'],
        confidence: 0.8,
      },
    });

    // Create occurrence
    const occurrence = occurrenceRepo.create({
      patternId,
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
      wasAdheredTo: null,
      status: 'active',
    });

    // Finding in different category (not security) - doesn't match the pattern
    const finding: ConfirmedFinding = {
      id: 'finding-2',
      scoutType: 'tests',
      title: 'Missing unit tests',
      description: 'No tests for the new function',
      severity: 'MEDIUM',
      category: 'testing',
    };

    const result: PRReviewResult = {
      workspaceId,
      projectId,
      prNumber: 1,
      issueId: 'TEST-123',
      confirmedFindings: [finding],
    };

    const adherenceResult = await updateAdherence(db, result);

    // Should update occurrence to mark as adhered (since no related finding)
    expect(adherenceResult.updated).toBe(1);

    // Verify occurrence was marked as adhered to
    const updatedOccurrence = occurrenceRepo.findById(occurrence.id);
    expect(updatedOccurrence?.wasAdheredTo).toBe(true);
  });

  it('returns 0 when no injection logs exist', async () => {
    const result: PRReviewResult = {
      workspaceId,
      projectId,
      prNumber: 1,
      issueId: 'TEST-999',
      confirmedFindings: [],
    };

    const adherenceResult = await updateAdherence(db, result);

    expect(adherenceResult.updated).toBe(0);
  });
});
