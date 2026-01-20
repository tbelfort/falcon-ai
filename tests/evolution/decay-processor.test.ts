/**
 * Unit tests for Confidence Decay Processor.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { processConfidenceDecay, processWorkspaceDecay } from '../../src/evolution/decay-processor.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../../src/storage/repositories/pattern-occurrence.repo.js';
import type { DocFingerprint, EvidenceBundle } from '../../src/schemas/index.js';

describe('processConfidenceDecay', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  const mockEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Use string concatenation',
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

  it('does not archive patterns above confidence threshold', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    // Create pattern with inferred quote type (low base confidence: 0.4)
    // Even with max decay (0.15), confidence stays at 0.25 > threshold (0.2)
    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Inferred confidence pattern',
      failureMode: 'incomplete',
      findingCategory: 'correctness',
      severity: 'LOW',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'inferred', // 0.4 base confidence
      technologies: [],
      taskTypes: [],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    // Create a single old occurrence
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 180); // 180 days ago

    occurrenceRepo.create({
      patternId: pattern.id,
      workspaceId,
      projectId,
      findingId: 'finding-1',
      issueId: 'TEST-123',
      prNumber: 1,
      severity: 'LOW',
      evidence: mockEvidence,
      carrierFingerprint: mockFingerprint,
      provenanceChain: [mockFingerprint],
      carrierExcerptHash: '0'.repeat(64),
      wasInjected: false,
      wasAdheredTo: null,
      status: 'active',
    });

    // Manually set the createdAt to old date for decay calculation
    db.prepare('UPDATE pattern_occurrences SET created_at = ? WHERE pattern_id = ?')
      .run(oldDate.toISOString(), pattern.id);

    const result = processConfidenceDecay(db, workspaceId, projectId);

    // With inferred (0.4) and max decay (0.15), confidence = 0.25 > threshold (0.2)
    // So pattern should NOT be archived
    expect(result.archivedCount).toBe(0);
    expect(result.archivedPatternIds).not.toContain(pattern.id);

    const updated = patternRepo.findById(pattern.id);
    expect(updated?.status).toBe('active');
  });

  it('keeps patterns above confidence threshold active', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

    // Create pattern with verbatim quote type (high base confidence: 0.75)
    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'High confidence pattern',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim', // 0.75 base confidence
      technologies: ['sql'],
      taskTypes: ['api'],
      touches: ['database'],
      status: 'active',
      permanent: false,
    });

    // Create multiple recent occurrences (boost + no decay)
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
        wasAdheredTo: null,
        status: 'active',
      });
    }

    const result = processConfidenceDecay(db, workspaceId, projectId);

    expect(result.archivedCount).toBe(0);

    const updated = patternRepo.findById(pattern.id);
    expect(updated?.status).toBe('active');
  });

  it('skips permanent patterns', () => {
    const patternRepo = new PatternDefinitionRepository(db);

    // Create permanent pattern (even with low confidence indicators)
    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Permanent pattern',
      failureMode: 'incomplete',
      findingCategory: 'compliance',
      severity: 'MEDIUM',
      alternative: 'Better approach',
      carrierStage: 'spec',
      primaryCarrierQuoteType: 'inferred',
      technologies: [],
      taskTypes: [],
      touches: ['config'],
      status: 'active',
      permanent: true, // Permanent flag set
    });

    const result = processConfidenceDecay(db, workspaceId, projectId);

    expect(result.skippedPermanent).toBe(1);
    expect(result.archivedPatternIds).not.toContain(pattern.id);

    const updated = patternRepo.findById(pattern.id);
    expect(updated?.status).toBe('active');
  });

  it('returns empty result when no active patterns exist', () => {
    const result = processConfidenceDecay(db, workspaceId, projectId);

    expect(result.archivedCount).toBe(0);
    expect(result.archivedPatternIds).toEqual([]);
    expect(result.skippedPermanent).toBe(0);
  });
});

describe('processWorkspaceDecay', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId1: string;
  let projectId2: string;

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

    const project1 = projectRepo.create({
      workspaceId,
      name: 'Project 1',
      repoOriginUrl: 'https://github.com/test/repo1',
      config: {},
      status: 'active',
    });
    projectId1 = project1.id;

    const project2 = projectRepo.create({
      workspaceId,
      name: 'Project 2',
      repoOriginUrl: 'https://github.com/test/repo2',
      config: {},
      status: 'active',
    });
    projectId2 = project2.id;
  });

  afterEach(() => {
    db.close();
  });

  it('processes decay for all projects in workspace', () => {
    const patternRepo = new PatternDefinitionRepository(db);

    // Create patterns in each project
    patternRepo.create({
      scope: { level: 'project', workspaceId, projectId: projectId1 },
      patternContent: 'Pattern 1',
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

    patternRepo.create({
      scope: { level: 'project', workspaceId, projectId: projectId2 },
      patternContent: 'Pattern 2',
      failureMode: 'incomplete',
      findingCategory: 'correctness',
      severity: 'MEDIUM',
      alternative: 'Better approach 2',
      carrierStage: 'spec',
      primaryCarrierQuoteType: 'paraphrase',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: true,
    });

    const results = processWorkspaceDecay(db, workspaceId);

    expect(results.size).toBe(2);
    expect(results.has(projectId1)).toBe(true);
    expect(results.has(projectId2)).toBe(true);

    // Project 2 has only permanent pattern, so it should have skipped 1
    const project2Result = results.get(projectId2);
    expect(project2Result?.skippedPermanent).toBe(1);
  });
});
