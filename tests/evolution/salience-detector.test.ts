/**
 * Unit tests for Salience Detector.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { detectSalienceIssues } from '../../src/evolution/salience-detector.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../../src/storage/repositories/pattern-occurrence.repo.js';
import { SalienceIssueRepository } from '../../src/storage/repositories/salience-issue.repo.js';
import type { DocFingerprint, EvidenceBundle } from '../../src/schemas/index.js';

describe('detectSalienceIssues', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  const mockEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Repeatedly ignored guidance',
    carrierQuoteType: 'verbatim',
    carrierInstructionKind: 'explicitly_harmful',
    carrierLocation: 'Section 3.1',
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

  it('creates salience issue when 3+ violations in 30 days', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    // Create pattern
    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Repeatedly violated guidance',
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

    // Create 3 recent occurrences where pattern was injected but not adhered to
    for (let i = 0; i < 3; i++) {
      occurrenceRepo.create({
        patternId: pattern.id,
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
        wasInjected: true, // Pattern WAS injected
        wasAdheredTo: false, // But NOT adhered to - this is a violation
        status: 'active',
      });
    }

    const result = detectSalienceIssues(db, workspaceId, projectId);

    expect(result.issuesFound).toBe(1);
    expect(result.newIssueIds.length).toBe(1);
  });

  it('does not create issue when fewer than 3 violations', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Few violations guidance',
      failureMode: 'incomplete',
      findingCategory: 'correctness',
      severity: 'MEDIUM',
      alternative: 'Better approach',
      carrierStage: 'spec',
      primaryCarrierQuoteType: 'paraphrase',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false,
    });

    // Only 2 violations (below threshold)
    for (let i = 0; i < 2; i++) {
      occurrenceRepo.create({
        patternId: pattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${i}`,
        prNumber: i + 1,
        severity: 'MEDIUM',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `${i}`.repeat(64),
        wasInjected: true,
        wasAdheredTo: false,
        status: 'active',
      });
    }

    const result = detectSalienceIssues(db, workspaceId, projectId);

    expect(result.issuesFound).toBe(0);
    expect(result.newIssueIds.length).toBe(0);
  });

  it('updates existing pending issue instead of creating duplicate', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const salienceRepo = new SalienceIssueRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Existing issue guidance',
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

    // Pre-create a pending salience issue for this pattern
    salienceRepo.upsert(
      {
        workspaceId,
        projectId,
        guidanceStage: pattern.carrierStage,
        guidanceLocation: pattern.patternContent.substring(0, 100),
        guidanceExcerpt: pattern.patternContent,
        occurrenceCount: 3,
        windowDays: 30,
        noncomplianceIds: [],
        status: 'pending',
      },
      randomUUID()
    );

    // Create 4 recent violations
    for (let i = 0; i < 4; i++) {
      occurrenceRepo.create({
        patternId: pattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${i}`,
        prNumber: i + 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `${i}`.repeat(64),
        wasInjected: true,
        wasAdheredTo: false,
        status: 'active',
      });
    }

    const result = detectSalienceIssues(db, workspaceId, projectId);

    // Should update existing, not create new
    expect(result.newIssueIds.length).toBe(0);
    expect(result.existingIssueIds.length).toBe(1);
  });

  it('does not update resolved issues', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);
    const salienceRepo = new SalienceIssueRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Resolved issue guidance',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['auth'],
      status: 'active',
      permanent: false,
    });

    // Create resolved salience issue
    const issue = salienceRepo.upsert(
      {
        workspaceId,
        projectId,
        guidanceStage: pattern.carrierStage,
        guidanceLocation: pattern.patternContent.substring(0, 100),
        guidanceExcerpt: pattern.patternContent,
        occurrenceCount: 5,
        windowDays: 30,
        noncomplianceIds: [],
        status: 'pending',
      },
      randomUUID()
    );
    salienceRepo.resolve({ id: issue.id, resolution: 'reformatted' });

    // Create 3 new violations
    for (let i = 0; i < 3; i++) {
      occurrenceRepo.create({
        patternId: pattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${i}`,
        prNumber: i + 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `${i}`.repeat(64),
        wasInjected: true,
        wasAdheredTo: false,
        status: 'active',
      });
    }

    const result = detectSalienceIssues(db, workspaceId, projectId);

    // Resolved issue should not be updated
    expect(result.existingIssueIds.length).toBe(0);
  });

  it('excludes violations outside 30-day window', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Old violations guidance',
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

    // Create 2 recent violations
    for (let i = 0; i < 2; i++) {
      occurrenceRepo.create({
        patternId: pattern.id,
        workspaceId,
        projectId,
        findingId: `finding-recent-${i}`,
        issueId: `TEST-${i}`,
        prNumber: i + 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `r${i}`.padEnd(64, '0'),
        wasInjected: true,
        wasAdheredTo: false,
        status: 'active',
      });
    }

    // Create 2 old violations (outside window)
    for (let i = 0; i < 2; i++) {
      const occ = occurrenceRepo.create({
        patternId: pattern.id,
        workspaceId,
        projectId,
        findingId: `finding-old-${i}`,
        issueId: `TEST-OLD-${i}`,
        prNumber: 100 + i,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `o${i}`.padEnd(64, '0'),
        wasInjected: true,
        wasAdheredTo: false,
        status: 'active',
      });

      // Set createdAt to 60 days ago
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      db.prepare('UPDATE pattern_occurrences SET created_at = ? WHERE id = ?')
        .run(oldDate.toISOString(), occ.id);
    }

    const result = detectSalienceIssues(db, workspaceId, projectId);

    // Only 2 recent violations - below threshold
    expect(result.issuesFound).toBe(0);
  });

  it('ignores occurrences where pattern was not injected', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Not injected guidance',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['network'],
      status: 'active',
      permanent: false,
    });

    // Create 4 occurrences where pattern was NOT injected
    for (let i = 0; i < 4; i++) {
      occurrenceRepo.create({
        patternId: pattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${i}`,
        prNumber: i + 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `${i}`.repeat(64),
        wasInjected: false, // Not injected - not a salience issue
        wasAdheredTo: null,
        status: 'active',
      });
    }

    const result = detectSalienceIssues(db, workspaceId, projectId);

    // These don't count as salience violations since pattern wasn't injected
    expect(result.issuesFound).toBe(0);
  });

  it('ignores occurrences where pattern was adhered to', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Adhered to guidance',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['caching'],
      status: 'active',
      permanent: false,
    });

    // Create 4 occurrences where pattern was adhered to
    for (let i = 0; i < 4; i++) {
      occurrenceRepo.create({
        patternId: pattern.id,
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${i}`,
        prNumber: i + 1,
        severity: 'HIGH',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: `${i}`.repeat(64),
        wasInjected: true,
        wasAdheredTo: true, // Adhered to - not a violation
        status: 'active',
      });
    }

    const result = detectSalienceIssues(db, workspaceId, projectId);

    expect(result.issuesFound).toBe(0);
  });
});
