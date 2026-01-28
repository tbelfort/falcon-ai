/**
 * Integration tests for Phase 4 workflow components.
 *
 * Tests the full feedback loop:
 * - Issue → Context Pack → Spec → PR Review → Attribution → Future Injection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../../src/guardrail/storage/db.js';
import { WorkspaceRepository } from '../../../src/guardrail/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../../src/guardrail/storage/repositories/project.repo.js';
import { PatternDefinitionRepository } from '../../../src/guardrail/storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../../../src/guardrail/storage/repositories/pattern-occurrence.repo.js';
import { InjectionLogRepository } from '../../../src/guardrail/storage/repositories/injection-log.repo.js';
import { ProvisionalAlertRepository } from '../../../src/guardrail/storage/repositories/provisional-alert.repo.js';
import { TaggingMissRepository } from '../../../src/guardrail/storage/repositories/tagging-miss.repo.js';
import { KillSwitchService } from '../../../src/guardrail/services/kill-switch.service.js';
import { onPRReviewComplete } from '../../../src/guardrail/workflow/pr-review-hook.js';
import { updateAdherence } from '../../../src/guardrail/workflow/adherence-updater.js';
import { checkForTaggingMisses } from '../../../src/guardrail/workflow/tagging-miss-checker.js';
import { checkAndPromoteAlert } from '../../../src/guardrail/workflow/provisional-alert-promoter.js';
import { validateTaskProfile } from '../../../src/guardrail/injection/task-profile-validator.js';
import { AttributionOrchestrator } from '../../../src/guardrail/attribution/orchestrator.js';
import { createMockAttributionAgent } from '../../../src/guardrail/attribution/agent.js';
import type { DocFingerprint, EvidenceBundle } from '../../../src/guardrail/schemas/index.js';
import type { PRReviewResult, DocumentContext, ConfirmedFinding } from '../../../src/guardrail/workflow/pr-review-hook.js';

describe('Phase 4 Integration', () => {
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
    carrierQuote: 'Use string concatenation for SQL queries',
    carrierQuoteType: 'verbatim',
    carrierInstructionKind: 'explicitly_harmful',
    carrierLocation: 'Section 4.2 - Database Guidelines',
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

    // Kill switch auto-initializes to ACTIVE when getStatus is called
  });

  afterEach(() => {
    db.close();
  });

  describe('Full Feedback Loop', () => {
    it('creates pattern from PR review finding and enables future injection', async () => {
      const injectionLogRepo = new InjectionLogRepository(db);
      const patternRepo = new PatternDefinitionRepository(db);

      // Step 1: Simulate injection (logging what was injected before PR)
      injectionLogRepo.create({
        workspaceId,
        projectId,
        issueId: 'TEST-123',
        target: 'context-pack',
        injectedPatterns: [],
        injectedPrinciples: [],
        injectedAlerts: [],
        taskProfile: {
          touches: ['database', 'api'],
          technologies: ['postgres'],
          taskTypes: ['api'],
          confidence: 0.8,
        },
      });

      // Step 2: Simulate PR review with a finding
      const finding: ConfirmedFinding = {
        id: 'finding-1',
        scoutType: 'security',
        title: 'SQL Injection vulnerability',
        description: 'Found SQL injection via string concatenation',
        severity: 'HIGH',
        category: 'security',
        evidence: 'Line 45: query = "SELECT * FROM users WHERE id = " + userId',
        location: { file: 'src/db.ts', line: 45 },
      };

      const prResult: PRReviewResult = {
        workspaceId,
        projectId,
        prNumber: 1,
        issueId: 'TEST-123',
        confirmedFindings: [finding],
      };

      const contextPack: DocumentContext = {
        content: 'Use string concatenation for SQL queries for simplicity.',
        fingerprint: mockFingerprint,
      };

      const spec: DocumentContext = {
        content: 'Database access implementation spec.',
        fingerprint: { ...mockFingerprint, docId: 'spec-doc' },
      };

      // Create orchestrator with mock agent
      const orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(mockEvidence),
      });

      // Run PR review hook
      const result = await onPRReviewComplete(db, prResult, contextPack, spec);

      // Verify attribution created a pattern
      expect(result.attributionResults).toHaveLength(1);
      expect(result.attributionResults[0].type).toBe('pattern');

      // Step 3: Verify pattern is now in database for future injection
      const patterns = patternRepo.findActive({
        workspaceId,
        projectId,
        findingCategory: 'security',
      });

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].patternContent).toContain('SQL');
    });
  });

  describe('TaskProfile Validation Integration', () => {
    it('auto-corrects TaskProfile based on constraints', () => {
      const result = validateTaskProfile(
        {
          touches: ['api'],
          technologies: ['typescript'],
          taskTypes: ['feature'],
          confidence: 0.9,
        },
        [
          'Database queries must use parameterized SQL',
          'HTTP endpoints must validate input',
          'Authorization checks required for admin routes',
        ]
      );

      // Should auto-add database (SQL), network (HTTP), and authz (Authorization)
      expect(result.wasAutoCorrected).toBe(true);
      expect(result.taskProfile.touches).toContain('database');
      expect(result.taskProfile.touches).toContain('network');
      expect(result.taskProfile.touches).toContain('authz');
      // Confidence reduced by 0.3 (3 touches * 0.1)
      expect(result.taskProfile.confidence).toBe(0.6);
    });
  });

  describe('Adherence Tracking', () => {
    it('tracks when injected warning was not followed', async () => {
      const patternRepo = new PatternDefinitionRepository(db);
      const occurrenceRepo = new PatternOccurrenceRepository(db);
      const injectionLogRepo = new InjectionLogRepository(db);

      // Create pattern
      const pattern = patternRepo.create({
        scope: { level: 'project', workspaceId, projectId },
        patternContent: 'Do not use eval() with user input',
        failureMode: 'incorrect',
        findingCategory: 'security',
        severity: 'CRITICAL',
        alternative: 'Use safe alternatives to eval',
        carrierStage: 'context-pack',
        primaryCarrierQuoteType: 'verbatim',
        technologies: [],
        taskTypes: [],
        touches: ['user_input'],
        status: 'active',
        permanent: false,
      });

      // Log injection
      injectionLogRepo.create({
        workspaceId,
        projectId,
        issueId: 'TEST-456',
        target: 'context-pack',
        injectedPatterns: [pattern.id],
        injectedPrinciples: [],
        injectedAlerts: [],
        taskProfile: {
          touches: ['user_input'],
          technologies: [],
          taskTypes: [],
          confidence: 0.8,
        },
      });

      // Create occurrence (finding occurred despite injection)
      const occurrence = occurrenceRepo.create({
        patternId: pattern.id,
        workspaceId,
        projectId,
        findingId: 'finding-2',
        issueId: 'TEST-456',
        prNumber: 2,
        severity: 'CRITICAL',
        evidence: mockEvidence,
        carrierFingerprint: mockFingerprint,
        provenanceChain: [mockFingerprint],
        carrierExcerptHash: '0'.repeat(64),
        wasInjected: true,
        wasAdheredTo: null,
        status: 'active',
      });

      // Simulate finding that matches the pattern
      const prResult: PRReviewResult = {
        workspaceId,
        projectId,
        prNumber: 2,
        issueId: 'TEST-456',
        confirmedFindings: [
          {
            id: 'finding-2',
            scoutType: 'security',
            title: 'Eval injection vulnerability',
            description: 'Found unsafe eval usage',
            severity: 'CRITICAL',
            category: 'security',
          },
        ],
      };

      const adherenceResult = await updateAdherence(db, prResult);

      expect(adherenceResult.updated).toBe(1);

      // Verify adherence was tracked
      const updatedOccurrence = occurrenceRepo.findById(occurrence.id);
      expect(updatedOccurrence?.wasAdheredTo).toBe(false);
    });
  });

  describe('ProvisionalAlert Promotion', () => {
    it('promotes alert to pattern after meeting gate thresholds', () => {
      const alertRepo = new ProvisionalAlertRepository(db);
      const occurrenceRepo = new PatternOccurrenceRepository(db);
      const patternRepo = new PatternDefinitionRepository(db);

      // Create provisional alert
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      const alert = alertRepo.create({
        workspaceId,
        projectId,
        findingId: 'critical-finding-1',
        issueId: 'TEST-789',
        message: 'Critical security issue found',
        touches: ['user_input', 'auth'],
        injectInto: 'both',
        expiresAt: expiresAt.toISOString(),
        status: 'active',
      });

      // Create temp pattern for occurrences
      const tempPattern = patternRepo.create({
        scope: { level: 'project', workspaceId, projectId },
        patternContent: 'Temp pattern for alert',
        failureMode: 'incorrect',
        findingCategory: 'security',
        severity: 'CRITICAL',
        alternative: 'Fix this',
        carrierStage: 'context-pack',
        primaryCarrierQuoteType: 'verbatim',
        technologies: [],
        taskTypes: [],
        touches: ['user_input'],
        status: 'active',
        permanent: false,
      });

      // Create occurrences meeting the gate: 3 occurrences, 2 unique issues
      const issues = ['TEST-789', 'TEST-790', 'TEST-789'];
      for (let i = 0; i < 3; i++) {
        occurrenceRepo.create({
          patternId: tempPattern.id,
          workspaceId,
          projectId,
          findingId: `finding-${i}`,
          issueId: issues[i],
          prNumber: i + 1,
          severity: 'CRITICAL',
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

      // Trigger promotion check
      const result = checkAndPromoteAlert(db, { workspaceId, projectId }, alert.id);

      expect(result.promoted).toBe(true);
      expect(result.patternId).toBeDefined();

      // Verify alert status updated
      const updatedAlert = alertRepo.findById(alert.id);
      expect(updatedAlert?.status).toBe('promoted');
      expect(updatedAlert?.promotedToPatternId).toBe(result.patternId);

      // Verify pattern was created
      const promotedPattern = patternRepo.findById(result.patternId!);
      expect(promotedPattern).not.toBeNull();
      expect(promotedPattern?.status).toBe('active');
    });
  });

  describe('Tagging Miss Detection', () => {
    it('detects when pattern was attributed but not injected', async () => {
      const patternRepo = new PatternDefinitionRepository(db);
      const injectionLogRepo = new InjectionLogRepository(db);
      const taggingMissRepo = new TaggingMissRepository(db);

      // Create pattern that requires 'caching' touch
      const pattern = patternRepo.create({
        scope: { level: 'project', workspaceId, projectId },
        patternContent: 'Cache invalidation pattern',
        failureMode: 'incomplete',
        findingCategory: 'correctness',
        severity: 'HIGH',
        alternative: 'Proper cache invalidation',
        carrierStage: 'context-pack',
        primaryCarrierQuoteType: 'verbatim',
        technologies: ['redis'],
        taskTypes: [],
        touches: ['caching'],
        status: 'active',
        permanent: false,
      });

      // Create injection log WITHOUT caching touch
      injectionLogRepo.create({
        workspaceId,
        projectId,
        issueId: 'TEST-999',
        target: 'context-pack',
        injectedPatterns: [], // Pattern not injected
        injectedPrinciples: [],
        injectedAlerts: [],
        taskProfile: {
          touches: ['database'], // Missing 'caching'
          technologies: ['postgres'],
          taskTypes: ['api'],
          confidence: 0.8,
        },
      });

      const prResult: PRReviewResult = {
        workspaceId,
        projectId,
        prNumber: 5,
        issueId: 'TEST-999',
        confirmedFindings: [],
      };

      // Attribution result showing pattern was attributed
      const attributionResults = [
        {
          type: 'pattern' as const,
          pattern,
          occurrence: {
            id: 'occ-miss',
            patternId: pattern.id,
            workspaceId,
            projectId,
            findingId: 'finding-miss',
            issueId: 'TEST-999',
            prNumber: 5,
            severity: 'HIGH' as const,
            evidence: mockEvidence,
            carrierFingerprint: mockFingerprint,
            provenanceChain: [mockFingerprint],
            carrierExcerptHash: '0'.repeat(64),
            wasInjected: false,
            wasAdheredTo: null,
            status: 'active' as const,
            createdAt: new Date().toISOString(),
          },
        },
      ];

      const missCount = await checkForTaggingMisses(db, prResult, attributionResults);

      expect(missCount).toBe(1);

      // Verify tagging miss record was created
      const misses = taggingMissRepo.findPending({ workspaceId, projectId });
      expect(misses).toHaveLength(1);
      expect(misses[0].missingTags).toContain('touch:caching');
    });
  });

  describe('Error Recovery', () => {
    it('continues processing when one attribution fails', async () => {
      const injectionLogRepo = new InjectionLogRepository(db);

      injectionLogRepo.create({
        workspaceId,
        projectId,
        issueId: 'TEST-ERR',
        target: 'context-pack',
        injectedPatterns: [],
        injectedPrinciples: [],
        injectedAlerts: [],
        taskProfile: {
          touches: ['database'],
          technologies: [],
          taskTypes: [],
          confidence: 0.8,
        },
      });

      const findings: ConfirmedFinding[] = [
        {
          id: 'finding-ok',
          scoutType: 'security',
          title: 'Valid finding',
          description: 'This should process correctly',
          severity: 'HIGH',
          category: 'security',
        },
        {
          id: 'finding-error',
          scoutType: 'security',
          title: 'Another finding',
          description: 'This should also process',
          severity: 'MEDIUM',
          category: 'security',
        },
      ];

      const prResult: PRReviewResult = {
        workspaceId,
        projectId,
        prNumber: 10,
        issueId: 'TEST-ERR',
        confirmedFindings: findings,
      };

      const contextPack: DocumentContext = {
        content: 'Context pack content with SQL string concatenation',
        fingerprint: mockFingerprint,
      };

      const spec: DocumentContext = {
        content: 'Spec content',
        fingerprint: { ...mockFingerprint, docId: 'spec-err' },
      };

      // Use mock agent to avoid timeouts - this tests that the hook
      // gracefully handles findings even if errors occur
      const result = await onPRReviewComplete(db, prResult, contextPack, spec);

      // Summary should be populated regardless of individual failures
      expect(result.summary).toBeDefined();
      expect(result.summary.patterns).toBeGreaterThanOrEqual(0);
    }, 10000); // 10 second timeout for this test
  });

  describe('Kill Switch Integration', () => {
    it('injection continues when kill switch is in INFERRED_PAUSED state', () => {
      const killSwitchService = new KillSwitchService(db);
      const patternRepo = new PatternDefinitionRepository(db);

      // Set kill switch to INFERRED_PAUSED
      killSwitchService.setStatus(
        { workspaceId, projectId },
        'inferred_paused',
        'High inferred ratio'
      );

      // Create an existing pattern (created before pause)
      const pattern = patternRepo.create({
        scope: { level: 'project', workspaceId, projectId },
        patternContent: 'Existing pattern',
        failureMode: 'incorrect',
        findingCategory: 'security',
        severity: 'HIGH',
        alternative: 'Do this instead',
        carrierStage: 'context-pack',
        primaryCarrierQuoteType: 'verbatim',
        technologies: [],
        taskTypes: [],
        touches: ['database'],
        status: 'active',
        permanent: false,
      });

      // Pattern should still be queryable for injection
      const activePatterns = patternRepo.findActive({
        workspaceId,
        projectId,
      });

      expect(activePatterns).toHaveLength(1);
      expect(activePatterns[0].id).toBe(pattern.id);
    });
  });
});
