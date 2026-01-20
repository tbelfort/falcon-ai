/**
 * Integration tests for the Attribution Orchestrator.
 *
 * Tests the full attribution flow including:
 * - Pattern creation
 * - Noncompliance detection
 * - Decisions handling
 * - Provisional alert creation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AttributionOrchestrator } from '../../src/attribution/orchestrator.js';
import { createMockAttributionAgent } from '../../src/attribution/agent.js';
import type { EvidenceBundle, DocFingerprint, Severity } from '../../src/schemas/index.js';
import { initializeDatabase } from '../../src/storage/db.js';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo.js';
import { ProjectRepository } from '../../src/storage/repositories/project.repo.js';

describe('AttributionOrchestrator', () => {
  let db: Database.Database;
  let orchestrator: AttributionOrchestrator;
  let workspaceId: string;
  let projectId: string;

  // Mock evidence for testing
  const mockEvidence: EvidenceBundle = {
    carrierStage: 'context-pack',
    carrierQuote: 'Use string concatenation for building SQL queries',
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

  // Mock fingerprints
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

  beforeEach(() => {
    // Create in-memory database
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

    // Create orchestrator with mock agent
    orchestrator = new AttributionOrchestrator(db, {
      agentFn: createMockAttributionAgent(mockEvidence),
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('Pattern creation', () => {
    it('creates a pattern for verbatim evidence', async () => {
      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-1',
          issueId: 'PROJ-123',
          prNumber: 456,
          title: 'SQL Injection Vulnerability',
          description: 'String concatenation used for SQL queries',
          scoutType: 'security',
          severity: 'HIGH',
          evidence: 'Line 42: query = "SELECT * FROM users WHERE id = " + userId',
          location: { file: 'src/db.ts', line: 42 },
        },
        contextPack: {
          content: 'Context pack content...',
          fingerprint: contextPackFingerprint,
        },
        spec: {
          content: 'Spec content...',
          fingerprint: specFingerprint,
        },
      });

      expect(result.type).toBe('pattern');
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.failureMode).toBe('incorrect');
      expect(result.pattern!.findingCategory).toBe('security');
      expect(result.occurrence).toBeDefined();
      expect(result.occurrence!.patternId).toBe(result.pattern!.id);
    });

    it('deduplicates patterns with same patternKey', async () => {
      // First attribution
      const result1 = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-1',
          issueId: 'PROJ-123',
          prNumber: 456,
          title: 'SQL Injection',
          description: 'SQL injection issue',
          scoutType: 'security',
          severity: 'MEDIUM',
          evidence: 'evidence',
          location: { file: 'src/db.ts' },
        },
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      // Second attribution with same pattern content
      const result2 = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-2',
          issueId: 'PROJ-124',
          prNumber: 457,
          title: 'Another SQL Injection',
          description: 'Another SQL injection',
          scoutType: 'security',
          severity: 'HIGH', // Higher severity
          evidence: 'evidence',
          location: { file: 'src/db2.ts' },
        },
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result1.pattern!.id).toBe(result2.pattern!.id);
      // Severity should be updated to MAX
      expect(result2.pattern!.severityMax).toBe('HIGH');
      // But each should have separate occurrences
      expect(result1.occurrence!.id).not.toBe(result2.occurrence!.id);
    });
  });

  describe('Decisions finding handling', () => {
    it('creates DocUpdateRequest for decisions findings', async () => {
      const decisionsEvidence: EvidenceBundle = {
        ...mockEvidence,
        carrierQuote: 'No caching policy was documented',
        carrierQuoteType: 'inferred',
        carrierInstructionKind: 'unknown',
      };

      const decisionsOrchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(decisionsEvidence),
      });

      const result = await decisionsOrchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-1',
          issueId: 'PROJ-123',
          prNumber: 456,
          title: 'Undocumented Caching Decision',
          description: 'Cache invalidation strategy was not documented',
          scoutType: 'decisions',
          severity: 'MEDIUM',
          evidence: 'No TTL specified for cache entries',
          location: { file: 'src/cache.ts' },
        },
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('doc_update_only');
      expect(result.docUpdateRequest).toBeDefined();
      expect(result.docUpdateRequest!.findingCategory).toBe('decisions');
      expect(result.docUpdateRequest!.decisionClass).toBe('caching');
    });

    it('creates pattern for HIGH severity decisions findings', async () => {
      const decisionsEvidence: EvidenceBundle = {
        ...mockEvidence,
        carrierQuote: 'Authorization model not documented',
        carrierQuoteType: 'inferred',
        carrierInstructionKind: 'unknown',
      };

      const decisionsOrchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(decisionsEvidence),
      });

      const result = await decisionsOrchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-1',
          issueId: 'PROJ-123',
          prNumber: 456,
          title: 'Undocumented Authorization Model',
          description: 'RBAC permissions not documented',
          scoutType: 'decisions',
          severity: 'HIGH',
          evidence: 'Role hierarchy unclear',
          location: { file: 'src/auth.ts' },
        },
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('pattern');
      expect(result.docUpdateRequest).toBeDefined();
      expect(result.pattern).toBeDefined();
    });
  });

  describe('Provisional alert creation', () => {
    it('creates provisional alert for HIGH security findings with inferred evidence', async () => {
      const inferredEvidence: EvidenceBundle = {
        ...mockEvidence,
        carrierQuote: 'No explicit guidance for input validation',
        carrierQuoteType: 'inferred',
        carrierInstructionKind: 'unknown',
      };

      const alertOrchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(inferredEvidence),
      });

      const result = await alertOrchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-1',
          issueId: 'PROJ-123',
          prNumber: 456,
          title: 'Missing Input Validation',
          description: 'User input not validated before processing',
          scoutType: 'security',
          severity: 'HIGH',
          evidence: 'No validation on user input',
          location: { file: 'src/api.ts' },
        },
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('provisional_alert');
      expect(result.provisionalAlert).toBeDefined();
      expect(result.provisionalAlert!.status).toBe('active');
    });

    it('does not create provisional alert for non-security findings', async () => {
      const inferredEvidence: EvidenceBundle = {
        ...mockEvidence,
        carrierQuoteType: 'inferred',
        carrierInstructionKind: 'unknown',
      };

      const alertOrchestrator = new AttributionOrchestrator(db, {
        agentFn: createMockAttributionAgent(inferredEvidence),
      });

      const result = await alertOrchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-1',
          issueId: 'PROJ-123',
          prNumber: 456,
          title: 'Missing Test Coverage',
          description: 'Function not tested',
          scoutType: 'tests', // Not security
          severity: 'HIGH',
          evidence: 'No tests',
          location: { file: 'src/utils.ts' },
        },
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.type).toBe('pattern');
      expect(result.provisionalAlert).toBeUndefined();
    });
  });

  describe('Resolver result tracking', () => {
    it('includes resolver result in attribution result', async () => {
      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-1',
          issueId: 'PROJ-123',
          prNumber: 456,
          title: 'SQL Injection',
          description: 'SQL injection',
          scoutType: 'security',
          severity: 'HIGH',
          evidence: 'evidence',
          location: { file: 'src/db.ts' },
        },
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.resolverResult).toBeDefined();
      expect(result.resolverResult!.failureMode).toBe('incorrect');
      expect(result.resolverResult!.reasoning).toBeTruthy();
    });
  });

  describe('Touch extraction', () => {
    it('extracts database touch from finding', async () => {
      const result = await orchestrator.attributeFinding({
        workspaceId,
        projectId,
        finding: {
          id: 'finding-1',
          issueId: 'PROJ-123',
          prNumber: 456,
          title: 'SQL Injection in Database Query',
          description: 'SQL query vulnerability in database layer',
          scoutType: 'security',
          severity: 'HIGH',
          evidence: 'Raw SQL query with user input',
          location: { file: 'src/db.ts' },
        },
        contextPack: { content: 'content', fingerprint: contextPackFingerprint },
        spec: { content: 'spec', fingerprint: specFingerprint },
      });

      expect(result.pattern!.touches).toContain('database');
    });
  });
});
