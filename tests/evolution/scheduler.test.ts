/**
 * Unit tests for Evolution Scheduler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runDailyMaintenance, runWorkspaceMaintenance } from '../../src/evolution/scheduler.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../../src/storage/repositories/pattern-occurrence.repo.js';
import type { DocFingerprint, EvidenceBundle } from '../../src/schemas/index.js';

describe('runDailyMaintenance', () => {
  let db: Database.Database;
  let workspaceId: string;
  let projectId: string;

  const mockEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Test guidance',
    carrierQuoteType: 'verbatim',
    carrierInstructionKind: 'explicitly_harmful',
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

  it('calls all maintenance processors', () => {
    // Create some test data to ensure processors have something to work with
    const patternRepo = new PatternDefinitionRepository(db);

    patternRepo.create({
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

    const result = runDailyMaintenance(db, workspaceId, projectId);

    // Verify all result sections are present
    expect(result).toHaveProperty('decayResults');
    expect(result).toHaveProperty('alertResults');
    expect(result).toHaveProperty('salienceResults');
    expect(result).toHaveProperty('killSwitchResults');
    expect(result).toHaveProperty('duration');

    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns decay results', () => {
    const patternRepo = new PatternDefinitionRepository(db);

    // Create a permanent pattern (should be skipped)
    patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Permanent pattern',
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
      permanent: true,
    });

    const result = runDailyMaintenance(db, workspaceId, projectId);

    expect(result.decayResults.skippedPermanent).toBe(1);
    expect(typeof result.decayResults.archivedPatterns).toBe('number');
  });

  it('returns alert processing results', () => {
    const result = runDailyMaintenance(db, workspaceId, projectId);

    expect(typeof result.alertResults.expired).toBe('number');
    expect(typeof result.alertResults.promoted).toBe('number');
  });

  it('returns salience detection results', () => {
    const result = runDailyMaintenance(db, workspaceId, projectId);

    expect(typeof result.salienceResults.newIssues).toBe('number');
    expect(typeof result.salienceResults.existingIssues).toBe('number');
  });

  it('returns kill switch results', () => {
    const result = runDailyMaintenance(db, workspaceId, projectId);

    expect(typeof result.killSwitchResults.resumed).toBe('number');
    expect(typeof result.killSwitchResults.evaluated).toBe('number');
  });
});

describe('runWorkspaceMaintenance', () => {
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

  it('processes all projects in workspace', () => {
    const results = runWorkspaceMaintenance(db, workspaceId);

    expect(results.size).toBe(2);
    expect(results.has(projectId1)).toBe(true);
    expect(results.has(projectId2)).toBe(true);
  });

  it('continues processing even if one project fails', () => {
    // Archive project 1 to make it inactive (should be skipped)
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('archived', projectId1);

    const results = runWorkspaceMaintenance(db, workspaceId);

    // Only active project 2 should be processed
    expect(results.size).toBe(1);
    expect(results.has(projectId2)).toBe(true);
  });

  it('returns empty map for workspace with no active projects', () => {
    // Archive all projects
    db.prepare('UPDATE projects SET status = ? WHERE workspace_id = ?').run(
      'archived',
      workspaceId
    );

    const results = runWorkspaceMaintenance(db, workspaceId);

    expect(results.size).toBe(0);
  });

  it('does not process projects from other workspaces', () => {
    const workspaceRepo = new WorkspaceRepository(db);
    const projectRepo = new ProjectRepository(db);

    // Create another workspace with a project
    const otherWorkspace = workspaceRepo.create({
      name: 'Other Workspace',
      slug: 'other-workspace',
      config: {},
      status: 'active',
    });

    projectRepo.create({
      workspaceId: otherWorkspace.id,
      name: 'Other Project',
      repoOriginUrl: 'https://github.com/other/repo',
      config: {},
      status: 'active',
    });

    const results = runWorkspaceMaintenance(db, workspaceId);

    // Only projects from target workspace
    expect(results.size).toBe(2);
    expect(results.has(projectId1)).toBe(true);
    expect(results.has(projectId2)).toBe(true);
  });
});
