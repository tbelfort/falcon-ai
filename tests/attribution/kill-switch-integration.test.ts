/**
 * Kill Switch Integration Tests
 *
 * Tests the integration between the Attribution Orchestrator and Kill Switch:
 * - ACTIVE state allows all patterns
 * - INFERRED_PAUSED skips inferred patterns
 * - FULLY_PAUSED skips all pattern creation
 * - Health evaluation triggers after each attribution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AttributionOrchestrator } from '../../src/attribution/orchestrator.js';
import { createMockAttributionAgent } from '../../src/attribution/agent.js';
import { KillSwitchService } from '../../src/services/kill-switch.service.js';
import type { EvidenceBundle, DocFingerprint } from '../../src/schemas/index.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';

describe('Kill Switch Integration', () => {
  let db: Database.Database;
  let orchestrator: AttributionOrchestrator;
  let killSwitchService: KillSwitchService;
  let workspaceId: string;
  let projectId: string;

  // Mock evidence variants
  const verbatimEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Use string concatenation for SQL queries',
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

  const inferredEvidence: EvidenceBundle = {
    ...verbatimEvidence,
    carrierQuote: 'No explicit guidance for SQL parameterization',
    carrierQuoteType: 'inferred',
    carrierInstructionKind: 'unknown',
  };

  const contextPackFingerprint: DocFingerprint = {
    kind: 'linear',
    docId: 'doc-123',
    updatedAt: new Date().toISOString(),
    contentHash: '0'.repeat(64),
  };

  const specFingerprint: DocFingerprint = {
    kind: 'linear',
    docId: 'doc-456',
    updatedAt: new Date().toISOString(),
    contentHash: '1'.repeat(64),
  };

  const createFinding = (id: string, scoutType = 'bugs') => ({
    id,
    issueId: `PROJ-${id}`,
    prNumber: 100,
    title: 'Test Finding',
    description: 'Test description',
    scoutType,
    severity: 'MEDIUM' as const,
    evidence: 'Test evidence',
    location: { file: 'src/test.ts' },
  });

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

    killSwitchService = new KillSwitchService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('ACTIVE state', () => {
    it('creates patterns normally for verbatim evidence', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(verbatimEvidence),
      });

      // Ensure ACTIVE state
      const status = killSwitchService.getStatus({ workspaceId, projectId });
      expect(status.state).toBe('active');

      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('pattern');
      expect(result.pattern).toBeDefined();
    });

    it('creates patterns normally for inferred evidence', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(inferredEvidence),
      });

      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('pattern');
      expect(result.pattern).toBeDefined();
    });
  });

  describe('INFERRED_PAUSED state', () => {
    beforeEach(() => {
      killSwitchService.pauseInferred(
        { workspaceId, projectId },
        'inferredRatio > 0.40'
      );
    });

    it('skips inferred patterns', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(inferredEvidence),
      });

      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('skipped');
      expect(result.killSwitchState).toBe('inferred_paused');
      expect(result.pattern).toBeUndefined();
      expect(result.resolverResult?.reasoning).toContain('KILL_SWITCH:INFERRED_PAUSED');
    });

    it('creates verbatim patterns normally', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(verbatimEvidence),
      });

      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('pattern');
      expect(result.pattern).toBeDefined();
    });

    it('creates paraphrase patterns normally', async () => {
      const paraphraseEvidence: EvidenceBundle = {
        ...verbatimEvidence,
        carrierQuoteType: 'paraphrase',
      };

      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(paraphraseEvidence),
      });

      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('pattern');
      expect(result.pattern).toBeDefined();
    });
  });

  describe('FULLY_PAUSED state', () => {
    beforeEach(() => {
      killSwitchService.pause(
        { workspaceId, projectId },
        'attributionPrecisionScore < 0.40'
      );
    });

    it('skips all pattern creation - verbatim', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(verbatimEvidence),
      });

      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('skipped');
      expect(result.killSwitchState).toBe('fully_paused');
      expect(result.pattern).toBeUndefined();
      expect(result.resolverResult?.reasoning).toContain('KILL_SWITCH:FULLY_PAUSED');
    });

    it('skips all pattern creation - inferred', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(inferredEvidence),
      });

      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('skipped');
      expect(result.killSwitchState).toBe('fully_paused');
    });
  });

  describe('Health evaluation', () => {
    it('records attribution outcome after each attribution', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(verbatimEvidence),
      });

      await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      // Check that metrics are recorded
      const metrics = killSwitchService.getHealthMetrics({ workspaceId, projectId });
      expect(metrics.totalAttributions).toBe(1);
      expect(metrics.verbatimAttributions).toBe(1);
    });

    it('tracks inferred attributions separately', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(inferredEvidence),
      });

      await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      const metrics = killSwitchService.getHealthMetrics({ workspaceId, projectId });
      expect(metrics.totalAttributions).toBe(1);
      expect(metrics.inferredAttributions).toBe(1);
    });
  });

  describe('State transitions', () => {
    it('maintains state after resume', async () => {
      // Pause then resume
      killSwitchService.pause({ workspaceId, projectId }, 'manual pause');
      killSwitchService.resume({ workspaceId, projectId }, 'manual resume');

      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(verbatimEvidence),
      });

      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('pattern');
    });

    it('respects state changes between attributions', async () => {
      orchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(inferredEvidence),
      });

      // First attribution - ACTIVE
      const result1 = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('1'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });
      expect(result1.type).toBe('pattern');

      // Pause inferred
      killSwitchService.pauseInferred({ workspaceId, projectId }, 'test');

      // Second attribution - INFERRED_PAUSED
      const result2 = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: createFinding('2'),
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });
      expect(result2.type).toBe('skipped');
      expect(result2.killSwitchState).toBe('inferred_paused');
    });
  });
});
