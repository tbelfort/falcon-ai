/**
 * Unit tests for Metrics Collector.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { collectMetrics } from '../../src/metrics/collector.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../../src/storage/repositories/pattern-occurrence.repo.js';
import { DerivedPrincipleRepository } from '../../src/storage/repositories/derived-principle.repo.js';
import { ProvisionalAlertRepository } from '../../src/storage/repositories/provisional-alert.repo.js';
import { SalienceIssueRepository } from '../../src/storage/repositories/salience-issue.repo.js';
import { InjectionLogRepository } from '../../src/storage/repositories/injection-log.repo.js';
import type { DocFingerprint, EvidenceBundle } from '../../src/schemas/index.js';

/**
 * Helper to create a future expiry date (14 days from now).
 */
function futureExpiryDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString();
}

describe('collectMetrics', () => {
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

  it('returns correct pattern counts', () => {
    const patternRepo = new PatternDefinitionRepository(db);

    // Create active patterns
    for (let i = 0; i < 3; i++) {
      patternRepo.create({
        scope: { level: 'project', workspaceId, projectId },
        patternContent: `Active pattern ${i}`,
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
    }

    // Create archived patterns
    for (let i = 0; i < 2; i++) {
      const pattern = patternRepo.create({
        scope: { level: 'project', workspaceId, projectId },
        patternContent: `Archived pattern ${i}`,
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
      patternRepo.archive(pattern.id);
    }

    const metrics = collectMetrics(db, workspaceId, projectId);

    expect(metrics.attribution.totalPatterns).toBe(5);
    expect(metrics.attribution.activePatterns).toBe(3);
    expect(metrics.attribution.archivedPatterns).toBe(2);
  });

  it('returns correct occurrence counts', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const occurrenceRepo = new PatternOccurrenceRepository(db);

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

    // Create active occurrences
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
        wasAdheredTo: null,
        status: 'active',
      });
    }

    // Create inactive occurrence
    const inactiveOcc = occurrenceRepo.create({
      patternId: pattern.id,
      workspaceId,
      projectId,
      findingId: 'finding-inactive',
      issueId: 'TEST-INACTIVE',
      prNumber: 99,
      severity: 'MEDIUM',
      evidence: mockEvidence,
      carrierFingerprint: mockFingerprint,
      provenanceChain: [mockFingerprint],
      carrierExcerptHash: 'i'.repeat(64),
      wasInjected: false,
      wasAdheredTo: null,
      status: 'active',
    });
    occurrenceRepo.update({
      workspaceId,
      id: inactiveOcc.id,
      status: 'inactive',
    });

    const metrics = collectMetrics(db, workspaceId, projectId);

    expect(metrics.attribution.totalOccurrences).toBe(5);
    expect(metrics.attribution.activeOccurrences).toBe(4);
  });

  it('returns correct injection counts', () => {
    const patternRepo = new PatternDefinitionRepository(db);
    const injectionLogRepo = new InjectionLogRepository(db);

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

    // Create context-pack injections
    for (let i = 0; i < 3; i++) {
      injectionLogRepo.create({
        workspaceId,
        projectId,
        issueId: `TEST-CP-${i}`,
        target: 'context-pack',
        injectedPatterns: [pattern.id],
        injectedPrinciples: [],
        injectedAlerts: [],
        taskProfile: {
          touches: ['database'],
          technologies: [],
          taskTypes: [],
          confidence: 0.8,
        },
      });
    }

    // Create spec injections
    for (let i = 0; i < 2; i++) {
      injectionLogRepo.create({
        workspaceId,
        projectId,
        issueId: `TEST-SPEC-${i}`,
        target: 'spec',
        injectedPatterns: [pattern.id],
        injectedPrinciples: [],
        injectedAlerts: [],
        taskProfile: {
          touches: ['database'],
          technologies: [],
          taskTypes: [],
          confidence: 0.9,
        },
      });
    }

    const metrics = collectMetrics(db, workspaceId, projectId);

    expect(metrics.injection.totalInjections).toBe(5);
    expect(metrics.injection.contextPackInjections).toBe(3);
    expect(metrics.injection.specInjections).toBe(2);
  });

  it('integrates with KillSwitchService', () => {
    const metrics = collectMetrics(db, workspaceId, projectId);

    // Should have health metrics from KillSwitchService
    expect(metrics.health).toBeDefined();
    // Health scores are null when insufficient data (new project with no attributions)
    expect(metrics.health.attributionPrecisionScore === null || typeof metrics.health.attributionPrecisionScore === 'number').toBe(true);
    expect(metrics.health.inferredRatio === null || typeof metrics.health.inferredRatio === 'number').toBe(true);
    expect(metrics.health.observedImprovementRate === null || typeof metrics.health.observedImprovementRate === 'number').toBe(true);
    expect(typeof metrics.health.killSwitchState).toBe('string');
    expect(metrics.health.killSwitchState).toBe('active'); // Default state
  });

  it('returns correct principle counts', () => {
    const principleRepo = new DerivedPrincipleRepository(db);

    // Create baseline principles
    for (let i = 0; i < 3; i++) {
      principleRepo.create({
        scope: { level: 'workspace', workspaceId },
        principle: `Baseline ${i}`,
        rationale: 'Security best practice',
        origin: 'baseline',
        injectInto: 'both',
        touches: ['database'],
        confidence: 0.9,
        status: 'active',
        permanent: true,
        externalRefs: [`CWE-${i}`],
      });
    }

    // Create derived principles
    for (let i = 0; i < 2; i++) {
      principleRepo.create({
        scope: { level: 'workspace', workspaceId },
        principle: `Derived ${i}`,
        rationale: 'Learned from patterns',
        origin: 'derived',
        injectInto: 'context-pack',
        touches: ['api'],
        confidence: 0.7,
        status: 'active',
        permanent: false,
      });
    }

    // Archive one derived principle
    const archivedPrinciple = principleRepo.create({
      scope: { level: 'workspace', workspaceId },
      principle: 'Archived derived',
      rationale: 'No longer relevant',
      origin: 'derived',
      injectInto: 'spec',
      touches: ['caching'],
      confidence: 0.5,
      status: 'active',
      permanent: false,
    });
    principleRepo.archive(archivedPrinciple.id);

    const metrics = collectMetrics(db, workspaceId, projectId);

    expect(metrics.principles.totalBaselines).toBe(3);
    expect(metrics.principles.totalDerived).toBe(3); // Including archived
    expect(metrics.principles.activeBaselines).toBe(3);
    expect(metrics.principles.activeDerived).toBe(2);
  });

  it('returns correct alert counts', () => {
    const alertRepo = new ProvisionalAlertRepository(db);
    const patternRepo = new PatternDefinitionRepository(db);

    // Create active alerts
    for (let i = 0; i < 4; i++) {
      alertRepo.create({
        workspaceId,
        projectId,
        findingId: `finding-${i}`,
        issueId: `TEST-${i}`,
        message: `Alert ${i}`,
        touches: ['database'],
        injectInto: 'context-pack',
        expiresAt: futureExpiryDate(),
        status: 'active',
      });
    }

    // Expire one alert
    const expiredAlert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-expired',
      issueId: 'TEST-EXPIRED',
      message: 'Expired alert',
      touches: ['api'],
      injectInto: 'spec',
      expiresAt: futureExpiryDate(),
      status: 'active',
    });
    alertRepo.expire(expiredAlert.id);

    // Create a pattern for promotion (need valid foreign key)
    const pattern = patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Promoted pattern content',
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

    // Promote one alert
    const promotedAlert = alertRepo.create({
      workspaceId,
      projectId,
      findingId: 'finding-promoted',
      issueId: 'TEST-PROMOTED',
      message: 'Promoted alert',
      touches: ['network'],
      injectInto: 'both',
      expiresAt: futureExpiryDate(),
      status: 'active',
    });
    alertRepo.promote(promotedAlert.id, pattern.id);

    const metrics = collectMetrics(db, workspaceId, projectId);

    expect(metrics.alerts.activeAlerts).toBe(4);
    expect(metrics.alerts.expiredAlerts).toBe(1);
    expect(metrics.alerts.promotedAlerts).toBe(1);
  });

  it('returns correct salience counts', () => {
    const salienceRepo = new SalienceIssueRepository(db);

    // Create open issues
    for (let i = 0; i < 3; i++) {
      salienceRepo.upsert(
        {
          workspaceId,
          projectId,
          guidanceStage: 'context-pack',
          guidanceLocation: `Section ${i}`,
          guidanceExcerpt: `Guidance excerpt ${i}`,
          occurrenceCount: 3,
          windowDays: 30,
          noncomplianceIds: [],
          status: 'pending',
        },
        randomUUID()
      );
    }

    // Create and resolve one issue
    const resolvedIssue = salienceRepo.upsert(
      {
        workspaceId,
        projectId,
        guidanceStage: 'spec',
        guidanceLocation: 'Resolved section',
        guidanceExcerpt: 'Resolved guidance',
        occurrenceCount: 5,
        windowDays: 30,
        noncomplianceIds: [],
        status: 'pending',
      },
      randomUUID()
    );
    salienceRepo.resolve({ id: resolvedIssue.id, resolution: 'reformatted' });

    const metrics = collectMetrics(db, workspaceId, projectId);

    // Note: Collector counts pending issues as "open"
    // The salience issues use 'pending' status
    expect(metrics.salience.resolvedIssues).toBe(1);
  });

  it('returns correct quote type pattern counts', () => {
    const patternRepo = new PatternDefinitionRepository(db);

    // Create verbatim patterns
    for (let i = 0; i < 3; i++) {
      patternRepo.create({
        scope: { level: 'project', workspaceId, projectId },
        patternContent: `Verbatim pattern ${i}`,
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
    }

    // Create paraphrase patterns
    for (let i = 0; i < 2; i++) {
      patternRepo.create({
        scope: { level: 'project', workspaceId, projectId },
        patternContent: `Paraphrase pattern ${i}`,
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
    }

    // Create inferred pattern
    patternRepo.create({
      scope: { level: 'project', workspaceId, projectId },
      patternContent: 'Inferred pattern',
      failureMode: 'ambiguous',
      findingCategory: 'testing',
      severity: 'LOW',
      alternative: 'Better approach',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'inferred',
      technologies: [],
      taskTypes: [],
      touches: ['network'],
      status: 'active',
      permanent: false,
    });

    const metrics = collectMetrics(db, workspaceId, projectId);

    expect(metrics.attribution.verbatimPatterns).toBe(3);
    expect(metrics.attribution.paraphrasePatterns).toBe(2);
    expect(metrics.attribution.inferredPatterns).toBe(1);
  });

  it('returns valid timestamp and scope', () => {
    const metrics = collectMetrics(db, workspaceId, projectId);

    expect(metrics.timestamp).toBeDefined();
    expect(() => new Date(metrics.timestamp)).not.toThrow();

    expect(metrics.scope.workspaceId).toBe(workspaceId);
    expect(metrics.scope.projectId).toBe(projectId);
  });
});
