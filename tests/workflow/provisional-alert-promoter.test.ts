/**
 * Unit tests for Provisional Alert Promoter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  checkAndPromoteAlert,
  onOccurrenceCreated,
  DEFAULT_PATTERN_GATE,
} from '../../src/workflow/provisional-alert-promoter.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { ProvisionalAlertRepository } from '../../src/storage/repositories/provisional-alert.repo.js';
import { PatternOccurrenceRepository } from '../../src/storage/repositories/pattern-occurrence.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import type { DocFingerprint, EvidenceBundle } from '../../src/schemas/index.js';

describe('checkAndPromoteAlert', () => {
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

  it('returns not found when alert does not exist', () => {
    const result = checkAndPromoteAlert(
      db,
      { workspaceId, projectId },
      'non-existent-alert'
    );

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('Alert not found');
  });

  it('returns already promoted when alert status is promoted', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const patternRepo = new PatternDefinitionRepository(db);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    // Create a pattern to use as the promotedToPatternId
    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Promoted pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Alternative',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    // First create an active alert
    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Test alert message',
      touches: ['database'],
      injectInto: 'context-pack',
      expiresAt: expiresAt.toISOString(),
      status: 'active',
    });

    // Then update it to promoted status with valid pattern ID
    alertRepo.update(alert.id, {
      status: 'promoted',
      promotedToPatternId: pattern.id,
    });

    const result = checkAndPromoteAlert(db, { workspaceId, projectId }, alert.id);

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('Already promoted');
  });

  it('does not promote when insufficient occurrences', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Test alert message',
      touches: ['database'],
      injectInto: 'context-pack',
      expiresAt: expiresAt.toISOString(),
      status: 'active',
    });

    // Create a temporary pattern for the occurrence
    const patternRepo = new PatternDefinitionRepository(db);
    const tempPattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Temp pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Alternative',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    // Create only 2 occurrences (need 3)
    for (let i = 0; i < 2; i++) {
      occurrenceRepo.create({
        patternId: tempPattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${100 + i}`,
        prNumber: i + 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: '0'.repeat(64),
        wasInjected: false,
        wasAdheredTo: null,
        status: 'active',
        provisionalAlertId: alert.id,
      });
    }

    const result = checkAndPromoteAlert(db, { workspaceId, projectId }, alert.id);

    expect(result.promoted).toBe(false);
    expect(result.reason).toContain('Insufficient occurrences');
  });

  it('does not promote when insufficient unique issues', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const patternRepo = new PatternDefinitionRepository(db);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Test alert message',
      touches: ['database'],
      injectInto: 'context-pack',
      expiresAt: expiresAt.toISOString(),
      status: 'active',
    });

    // Create temp pattern
    const tempPattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Temp pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Alternative',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    // Create 3 occurrences but all from same issue (need 2 unique issues)
    for (let i = 0; i < 3; i++) {
      occurrenceRepo.create({
        patternId: tempPattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: 'TEST-123', // Same issue for all
        prNumber: 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: '0'.repeat(64),
        wasInjected: false,
        wasAdheredTo: null,
        status: 'active',
        provisionalAlertId: alert.id,
      });
    }

    const result = checkAndPromoteAlert(db, { workspaceId, projectId }, alert.id);

    expect(result.promoted).toBe(false);
    expect(result.reason).toContain('Insufficient unique issues');
  });

  it('promotes alert when all gates pass', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const patternRepo = new PatternDefinitionRepository(db);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Test alert message',
      touches: ['database'],
      injectInto: 'context-pack',
      expiresAt: expiresAt.toISOString(),
      status: 'active',
    });

    // Create temp pattern
    const tempPattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Temp pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Alternative',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    // Create 3 occurrences from 2 unique issues
    const issues = ['TEST-123', 'TEST-456', 'TEST-123'];
    for (let i = 0; i < 3; i++) {
      occurrenceRepo.create({
        patternId: tempPattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: issues[i],
        prNumber: i + 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: '0'.repeat(64),
        wasInjected: false,
        wasAdheredTo: null,
        status: 'active',
        provisionalAlertId: alert.id,
      });
    }

    const result = checkAndPromoteAlert(db, { workspaceId, projectId }, alert.id);

    expect(result.promoted).toBe(true);
    expect(result.patternId).toBeDefined();

    // Verify alert was marked as promoted
    const updatedAlert = alertRepo.findById(alert.id);
    expect(updatedAlert?.status).toBe('promoted');
    expect(updatedAlert?.promotedToPatternId).toBe(result.patternId);
  });
});

describe('onOccurrenceCreated', () => {
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

  it('returns null when no provisionalAlertId provided', () => {
    const result = onOccurrenceCreated(
      db,
      { workspaceId, projectId },
      'occurrence-1',
      undefined
    );

    expect(result).toBeNull();
  });

  it('calls checkAndPromoteAlert when provisionalAlertId provided', () => {
    const result = onOccurrenceCreated(
      db,
      { workspaceId, projectId },
      'occurrence-1',
      'non-existent-alert'
    );

    expect(result).not.toBeNull();
    expect(result!.promoted).toBe(false);
    expect(result!.reason).toBe('Alert not found');
  });
});

describe('DEFAULT_PATTERN_GATE', () => {
  it('has expected default values', () => {
    expect(DEFAULT_PATTERN_GATE.minOccurrences).toBe(3);
    expect(DEFAULT_PATTERN_GATE.minUniqueIssues).toBe(2);
    expect(DEFAULT_PATTERN_GATE.minConfidence).toBe(0.7);
    expect(DEFAULT_PATTERN_GATE.maxDaysOld).toBe(90);
  });
});
