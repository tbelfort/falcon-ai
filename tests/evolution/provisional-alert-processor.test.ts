/**
 * Unit tests for Provisional Alert Processor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  processProvisionalAlertExpiry,
  checkForEarlyPromotion,
} from '../../src/evolution/provisional-alert-processor.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { ProvisionalAlertRepository } from '../../src/storage/repositories/provisional-alert.repo.js';
import { PatternOccurrenceRepository } from '../../src/storage/repositories/pattern-occurrence.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import type { DocFingerprint, EvidenceBundle } from '../../src/schemas/index.js';

/**
 * Helper to create a future expiry date (14 days from now).
 */
function futureExpiryDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString();
}

describe('processProvisionalAlertExpiry', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  const mockEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Test guidance',
    carrierQuoteType: 'inferred',
    carrierInstructionKind: 'benign_but_missing_guardrails',
    carrierLocation: 'Section 1',
    hasCitation: false,
    citedSources: [],
    sourceRetrievable: false,
    sourceAgreesWithCarrier: null,
    mandatoryDocMissing: false,
    vaguenessSignals: [],
    hasTestableAcceptanceCriteria: true,
    conflictSignals: [],
  };

  const mockFingerprint: DocFingerprint = {
    kind: 'git',
    repo: 'org/repo',
    path: 'docs/guide.md',
    commitSha: 'a'.repeat(40),
  };

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

  it('marks expired alerts as expired when below promotion threshold', () => {
    const alertRepo = new ProvisionalAlertRepository(db);

    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Alert message',
      touches: ['database'],
      injectInto: 'context-pack',
      expiresAt: futureExpiryDate(),
      status: 'active',
    });

    // Manually set expiry date to the past
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1);
    db.prepare('UPDATE provisional_alerts SET expires_at = ? WHERE id = ?')
      .run(expiredDate.toISOString(), alert.id);

    const result = processProvisionalAlertExpiry(db, workspaceId, projectId);

    expect(result.expired).toBe(1);
    expect(result.expiredAlertIds).toContain(alert.id);

    const updated = alertRepo.findById(alert.id);
    expect(updated?.status).toBe('expired');
  });

  it('promotes alert with 2+ occurrences to pattern', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const patternRepo = new PatternDefinitionRepository(db);

    // Create a placeholder pattern (needed for occurrence creation)
    const placeholderPattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Placeholder for alert occurrences',
      failureMode: 'incomplete',
      findingCategory: 'correctness',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'inferred',
      technologies: [],
      taskTypes: [],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Repeated issue alert',
      touches: ['database'],
      injectInto: 'context-pack',
      expiresAt: futureExpiryDate(),
      status: 'active',
    });

    // Manually set expiry date to the past
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1);
    db.prepare('UPDATE provisional_alerts SET expires_at = ? WHERE id = ?')
      .run(expiredDate.toISOString(), alert.id);

    // Create 2 occurrences linked to this alert
    for (let i = 0; i < 2; i++) {
      occurrenceRepo.create({
        patternId: placeholderPattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${100 + i}`,
        prNumber: i + 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `${i}`.repeat(64),
        wasInjected: false,
        wasAdheredTo: null,
        status: 'active',
        provisionalAlertId: alert.id,
      });
    }

    const result = processProvisionalAlertExpiry(db, workspaceId, projectId);

    expect(result.promoted).toBe(1);
    expect(result.promotedAlertIds).toContain(alert.id);

    const updated = alertRepo.findById(alert.id);
    expect(updated?.status).toBe('promoted');
    expect(updated?.promotedToPatternId).toBeDefined();
  });

  it('expires alerts without enough occurrences', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const patternRepo = new PatternDefinitionRepository(db);

    // Create placeholder pattern
    const placeholderPattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Placeholder',
      failureMode: 'incomplete',
      findingCategory: 'correctness',
      severity: 'MEDIUM',
      alternative: 'Better',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'inferred',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Single occurrence alert',
      touches: ['api'],
      injectInto: 'spec',
      expiresAt: futureExpiryDate(),
      status: 'active',
    });

    // Manually set expiry date to the past
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1);
    db.prepare('UPDATE provisional_alerts SET expires_at = ? WHERE id = ?')
      .run(expiredDate.toISOString(), alert.id);

    // Only 1 occurrence (below threshold of 2)
    occurrenceRepo.create({
      patternId: placeholderPattern.id,
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      prNumber: 1,
      severity: 'MEDIUM',
      evidence: mockEvidence,
      carrierFingerprint: mockFingerprint,
      provenanceChain: [mockFingerprint],
      carrierExcerptHash: '0'.repeat(64),
      wasInjected: false,
      wasAdheredTo: null,
      status: 'active',
      provisionalAlertId: alert.id,
    });

    const result = processProvisionalAlertExpiry(db, workspaceId, projectId);

    expect(result.expired).toBe(1);
    expect(result.promoted).toBe(0);

    const updated = alertRepo.findById(alert.id);
    expect(updated?.status).toBe('expired');
    expect(updated?.promotedToPatternId).toBeUndefined();
  });
});

describe('checkForEarlyPromotion', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  const mockEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Test guidance',
    carrierQuoteType: 'inferred',
    carrierInstructionKind: 'benign_but_missing_guardrails',
    carrierLocation: 'Section 1',
    hasCitation: false,
    citedSources: [],
    sourceRetrievable: false,
    sourceAgreesWithCarrier: null,
    mandatoryDocMissing: false,
    vaguenessSignals: [],
    hasTestableAcceptanceCriteria: true,
    conflictSignals: [],
  };

  const mockFingerprint: DocFingerprint = {
    kind: 'git',
    repo: 'org/repo',
    path: 'docs/guide.md',
    commitSha: 'a'.repeat(40),
  };

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

  it('promotes alert early when threshold reached', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const patternRepo = new PatternDefinitionRepository(db);

    // Create placeholder pattern
    const placeholderPattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Placeholder',
      failureMode: 'incomplete',
      findingCategory: 'security',
      severity: 'CRITICAL',
      alternative: 'Better',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'inferred',
      technologies: [],
      taskTypes: [],
      touches: ['auth'],
      status: 'active',
      permanent: false,
    });

    // Create active alert (not expired yet)
    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Early promotion alert',
      touches: ['auth'],
      injectInto: 'both',
      expiresAt: futureExpiryDate(),
      status: 'active',
    });

    // Create 2 occurrences (meets threshold)
    for (let i = 0; i < 2; i++) {
      occurrenceRepo.create({
        patternId: placeholderPattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${100 + i}`,
        prNumber: i + 1,
        severity: 'CRITICAL',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `${i}`.repeat(64),
        wasInjected: false,
        wasAdheredTo: null,
        status: 'active',
        provisionalAlertId: alert.id,
      });
    }

    const promoted = checkForEarlyPromotion(db, workspaceId, alert.id);

    expect(promoted).toBe(true);

    const updated = alertRepo.findById(alert.id);
    expect(updated?.status).toBe('promoted');
    expect(updated?.promotedToPatternId).toBeDefined();
  });

  it('does not promote alert below threshold', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const patternRepo = new PatternDefinitionRepository(db);

    // Create placeholder pattern
    const placeholderPattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Placeholder',
      failureMode: 'incomplete',
      findingCategory: 'correctness',
      severity: 'MEDIUM',
      alternative: 'Better',
      carrierStage: 'spec',
      primaryCarrierQuoteType: 'inferred',
      technologies: [],
      taskTypes: [],
      touches: ['network'],
      status: 'active',
      permanent: false,
    });

    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Single occurrence',
      touches: ['network'],
      injectInto: 'spec',
      expiresAt: futureExpiryDate(),
      status: 'active',
    });

    // Only 1 occurrence
    occurrenceRepo.create({
      patternId: placeholderPattern.id,
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      prNumber: 1,
      severity: 'MEDIUM',
      evidence: mockEvidence,
      carrierFingerprint: mockFingerprint,
      provenanceChain: [mockFingerprint],
      carrierExcerptHash: '0'.repeat(64),
      wasInjected: false,
      wasAdheredTo: null,
      status: 'active',
      provisionalAlertId: alert.id,
    });

    const promoted = checkForEarlyPromotion(db, workspaceId, alert.id);

    expect(promoted).toBe(false);

    const updated = alertRepo.findById(alert.id);
    expect(updated?.status).toBe('active');
  });

  it('returns false for non-existent alert', () => {
    const promoted = checkForEarlyPromotion(db, workspaceId, 'non-existent-id');
    expect(promoted).toBe(false);
  });

  it('returns false for already promoted alert', () => {
    const alertRepo = new ProvisionalAlertRepository(db);

    const alert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      message: 'Already promoted',
      touches: ['database'],
      injectInto: 'context-pack',
      expiresAt: futureExpiryDate(),
      status: 'active',
    });

    // Manually set to promoted
    db.prepare('UPDATE provisional_alerts SET status = ? WHERE id = ?')
      .run('promoted', alert.id);

    const promoted = checkForEarlyPromotion(db, workspaceId, alert.id);
    expect(promoted).toBe(false);
  });
});
