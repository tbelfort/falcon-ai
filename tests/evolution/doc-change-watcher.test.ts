/**
 * Unit tests for Document Change Watcher.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { onDocumentChange, type DocChange } from '../../src/evolution/doc-change-watcher.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../../src/storage/repositories/pattern-occurrence.repo.js';
import type { DocFingerprint, EvidenceBundle } from '../../src/schemas/index.js';

describe('onDocumentChange', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;
  let patternId: string;

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

  it('invalidates occurrences matching git document change', () => {
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const gitFingerprint: DocFingerprint = {
      kind: 'git',
      repo: 'org/repo',
      path: 'docs/guide.md',
      commitSha: 'a'.repeat(40),
    };

    // Create occurrence with git fingerprint
    const occurrence = occurrenceRepo.create({
      patternId,
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      prNumber: 1,
      severity: 'HIGH',
      evidence: mockEvidence,
      carrierFingerprint: gitFingerprint,
      provenanceChain: [gitFingerprint],
      carrierExcerptHash: '0'.repeat(64),
      wasInjected: true,
      wasAdheredTo: null,
      status: 'active',
    });

    const change: DocChange = {
      kind: 'git',
      repo: 'org/repo',
      path: 'docs/guide.md',
    };

    const result = onDocumentChange(db, workspaceId, change);

    expect(result.invalidatedCount).toBe(1);
    expect(result.occurrenceIds).toContain(occurrence.id);

    // Verify occurrence is now inactive
    const updated = occurrenceRepo.findById(occurrence.id);
    expect(updated?.status).toBe('inactive');
    expect(updated?.inactiveReason).toBe('superseded_doc');
  });

  it('invalidates occurrences matching linear document change', () => {
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const linearFingerprint: DocFingerprint = {
      kind: 'linear',
      docId: 'doc-abc123',
      updatedAt: new Date().toISOString(),
      contentHash: '0'.repeat(64),
    };

    const occurrence = occurrenceRepo.create({
      patternId,
      workspaceId,
      projectId,
      findingId: 'finding-2',
      issueId: 'TEST-124',
      prNumber: 2,
      severity: 'MEDIUM',
      evidence: mockEvidence,
      carrierFingerprint: linearFingerprint,
      provenanceChain: [linearFingerprint],
      carrierExcerptHash: '1'.repeat(64),
      wasInjected: false,
      wasAdheredTo: null,
      status: 'active',
    });

    const change: DocChange = {
      kind: 'linear',
      docId: 'doc-abc123',
    };

    const result = onDocumentChange(db, workspaceId, change);

    expect(result.invalidatedCount).toBe(1);
    expect(result.occurrenceIds).toContain(occurrence.id);

    const updated = occurrenceRepo.findById(occurrence.id);
    expect(updated?.status).toBe('inactive');
  });

  it('invalidates occurrences matching web URL change', () => {
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const webFingerprint: DocFingerprint = {
      kind: 'web',
      url: 'https://docs.example.com/api',
      retrievedAt: new Date().toISOString(),
      excerptHash: '2'.repeat(64),
    };

    const occurrence = occurrenceRepo.create({
      patternId,
      workspaceId,
      projectId,
      findingId: 'finding-3',
      issueId: 'TEST-125',
      prNumber: 3,
      severity: 'LOW',
      evidence: mockEvidence,
      carrierFingerprint: webFingerprint,
      provenanceChain: [webFingerprint],
      carrierExcerptHash: '2'.repeat(64),
      wasInjected: true,
      wasAdheredTo: true,
      status: 'active',
    });

    const change: DocChange = {
      kind: 'web',
      url: 'https://docs.example.com/api',
    };

    const result = onDocumentChange(db, workspaceId, change);

    expect(result.invalidatedCount).toBe(1);
    expect(result.occurrenceIds).toContain(occurrence.id);
  });

  it('invalidates occurrences matching external ID change', () => {
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const externalFingerprint: DocFingerprint = {
      kind: 'external',
      id: 'CWE-89',
      version: '4.5',
    };

    const occurrence = occurrenceRepo.create({
      patternId,
      workspaceId,
      projectId,
      findingId: 'finding-4',
      issueId: 'TEST-126',
      prNumber: 4,
      severity: 'CRITICAL',
      evidence: mockEvidence,
      carrierFingerprint: externalFingerprint,
      provenanceChain: [externalFingerprint],
      carrierExcerptHash: '3'.repeat(64),
      wasInjected: false,
      wasAdheredTo: null,
      status: 'active',
    });

    const change: DocChange = {
      kind: 'external',
      externalId: 'CWE-89',
    };

    const result = onDocumentChange(db, workspaceId, change);

    expect(result.invalidatedCount).toBe(1);
    expect(result.occurrenceIds).toContain(occurrence.id);
  });

  it('returns empty result when missing required fields for git', () => {
    const change: DocChange = {
      kind: 'git',
      // Missing repo and path
    };

    const result = onDocumentChange(db, workspaceId, change);

    expect(result.invalidatedCount).toBe(0);
    expect(result.occurrenceIds).toEqual([]);
  });

  it('returns empty result when missing required fields for linear', () => {
    const change: DocChange = {
      kind: 'linear',
      // Missing docId
    };

    const result = onDocumentChange(db, workspaceId, change);

    expect(result.invalidatedCount).toBe(0);
    expect(result.occurrenceIds).toEqual([]);
  });

  it('returns empty result for unknown change kind', () => {
    const change = {
      kind: 'unknown' as DocChange['kind'],
    };

    const result = onDocumentChange(db, workspaceId, change);

    expect(result.invalidatedCount).toBe(0);
    expect(result.occurrenceIds).toEqual([]);
  });

  it('does not invalidate occurrences from different workspace', () => {
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    const gitFingerprint: DocFingerprint = {
      kind: 'git',
      repo: 'org/repo',
      path: 'docs/guide.md',
      commitSha: 'a'.repeat(40),
    };

    occurrenceRepo.create({
      patternId,
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      prNumber: 1,
      severity: 'HIGH',
      evidence: mockEvidence,
      carrierFingerprint: gitFingerprint,
      provenanceChain: [gitFingerprint],
      carrierExcerptHash: '0'.repeat(64),
      wasInjected: true,
      wasAdheredTo: null,
      status: 'active',
    });

    // Different workspace
    const differentWorkspaceId = 'different-workspace-id';

    const change: DocChange = {
      kind: 'git',
      repo: 'org/repo',
      path: 'docs/guide.md',
    };

    const result = onDocumentChange(db, differentWorkspaceId, change);

    expect(result.invalidatedCount).toBe(0);
  });
});
