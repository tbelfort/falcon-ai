/**
 * Tests for Zod schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  ScopeSchema,
  WorkspaceSchema,
  ProjectSchema,
  PatternDefinitionSchema,
  PatternOccurrenceSchema,
  DerivedPrincipleSchema,
  ExecutionNoncomplianceSchema,
  DocUpdateRequestSchema,
  TaggingMissSchema,
  InjectionLogSchema,
  ProvisionalAlertSchema,
  SalienceIssueSchema,
  KillSwitchStatusSchema,
  AttributionOutcomeSchema,
  EvidenceBundleSchema,
  DocFingerprintSchema,
  FailureModeSchema,
  FindingCategorySchema,
  SeveritySchema,
  TouchSchema,
} from '../../src/schemas/index.js';

describe('Scope Schema', () => {
  it('accepts global scope', () => {
    const result = ScopeSchema.safeParse({ level: 'global' });
    expect(result.success).toBe(true);
  });

  it('accepts workspace scope', () => {
    const result = ScopeSchema.safeParse({
      level: 'workspace',
      workspaceId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('accepts project scope', () => {
    const result = ScopeSchema.safeParse({
      level: 'project',
      workspaceId: '11111111-1111-1111-1111-111111111111',
      projectId: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid scope level', () => {
    const result = ScopeSchema.safeParse({ level: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects workspace scope without workspaceId', () => {
    const result = ScopeSchema.safeParse({ level: 'workspace' });
    expect(result.success).toBe(false);
  });
});

describe('Enum Schemas', () => {
  it('accepts valid failure modes', () => {
    const modes = [
      'incorrect',
      'incomplete',
      'missing_reference',
      'ambiguous',
      'conflict_unresolved',
      'synthesis_drift',
    ];
    for (const mode of modes) {
      expect(FailureModeSchema.safeParse(mode).success).toBe(true);
    }
  });

  it('accepts valid finding categories including decisions', () => {
    const categories = ['security', 'correctness', 'testing', 'compliance', 'decisions'];
    for (const cat of categories) {
      expect(FindingCategorySchema.safeParse(cat).success).toBe(true);
    }
  });

  it('accepts valid severities', () => {
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    for (const sev of severities) {
      expect(SeveritySchema.safeParse(sev).success).toBe(true);
    }
  });

  it('accepts valid touches', () => {
    const touches = [
      'user_input',
      'database',
      'network',
      'auth',
      'authz',
      'caching',
      'schema',
      'logging',
      'config',
      'api',
    ];
    for (const touch of touches) {
      expect(TouchSchema.safeParse(touch).success).toBe(true);
    }
  });

  it('rejects invalid enum values', () => {
    expect(FailureModeSchema.safeParse('invalid').success).toBe(false);
    expect(FindingCategorySchema.safeParse('invalid').success).toBe(false);
    expect(SeveritySchema.safeParse('invalid').success).toBe(false);
    expect(TouchSchema.safeParse('invalid').success).toBe(false);
  });
});

describe('DocFingerprint Schema', () => {
  it('accepts git fingerprint', () => {
    const result = DocFingerprintSchema.safeParse({
      kind: 'git',
      repo: 'owner/repo',
      path: 'src/file.ts',
      commitSha: 'a'.repeat(40),
    });
    expect(result.success).toBe(true);
  });

  it('accepts linear fingerprint', () => {
    const result = DocFingerprintSchema.safeParse({
      kind: 'linear',
      docId: 'DOC-123',
      updatedAt: '2026-01-18T00:00:00.000Z',
      contentHash: 'b'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('accepts web fingerprint', () => {
    const result = DocFingerprintSchema.safeParse({
      kind: 'web',
      url: 'https://example.com/doc',
      retrievedAt: '2026-01-18T00:00:00.000Z',
      excerptHash: 'c'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('accepts external fingerprint', () => {
    const result = DocFingerprintSchema.safeParse({
      kind: 'external',
      id: 'CWE-89',
      version: '4.0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid fingerprint kind', () => {
    const result = DocFingerprintSchema.safeParse({
      kind: 'invalid',
      id: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('PatternDefinition Schema', () => {
  const validPattern = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    scope: {
      level: 'project',
      workspaceId: '11111111-1111-1111-1111-111111111111',
      projectId: '22222222-2222-2222-2222-222222222222',
    },
    patternKey: 'a'.repeat(64),
    contentHash: 'b'.repeat(64),
    patternContent: 'Use template literals for SQL queries',
    failureMode: 'incorrect',
    findingCategory: 'security',
    severity: 'HIGH',
    severityMax: 'HIGH',
    alternative: 'Always use parameterized queries',
    carrierStage: 'context-pack',
    primaryCarrierQuoteType: 'verbatim',
    technologies: ['sql', 'postgres'],
    taskTypes: ['api'],
    touches: ['database', 'user_input'],
    status: 'active',
    permanent: false,
    createdAt: '2026-01-18T00:00:00.000Z',
    updatedAt: '2026-01-18T00:00:00.000Z',
  };

  it('accepts valid pattern', () => {
    const result = PatternDefinitionSchema.safeParse(validPattern);
    expect(result.success).toBe(true);
  });

  it('accepts decisions category', () => {
    const result = PatternDefinitionSchema.safeParse({
      ...validPattern,
      findingCategory: 'decisions',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid failureMode', () => {
    const result = PatternDefinitionSchema.safeParse({
      ...validPattern,
      failureMode: 'invalid_mode',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid touch', () => {
    const result = PatternDefinitionSchema.safeParse({
      ...validPattern,
      touches: ['invalid_touch'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing patternKey', () => {
    const { patternKey, ...withoutKey } = validPattern;
    const result = PatternDefinitionSchema.safeParse(withoutKey);
    expect(result.success).toBe(false);
  });

  it('rejects missing severityMax', () => {
    const { severityMax, ...withoutMax } = validPattern;
    const result = PatternDefinitionSchema.safeParse(withoutMax);
    expect(result.success).toBe(false);
  });

  it('rejects non-project scope', () => {
    const result = PatternDefinitionSchema.safeParse({
      ...validPattern,
      scope: { level: 'workspace', workspaceId: '11111111-1111-1111-1111-111111111111' },
    });
    expect(result.success).toBe(false);
  });
});

describe('DerivedPrinciple Schema', () => {
  const validPrinciple = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    scope: {
      level: 'workspace',
      workspaceId: '11111111-1111-1111-1111-111111111111',
    },
    principle: 'Always use parameterized queries',
    rationale: 'Prevents SQL injection',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['database', 'user_input'],
    confidence: 0.9,
    status: 'active',
    permanent: true,
    createdAt: '2026-01-18T00:00:00.000Z',
    updatedAt: '2026-01-18T00:00:00.000Z',
  };

  it('accepts valid principle', () => {
    const result = DerivedPrincipleSchema.safeParse(validPrinciple);
    expect(result.success).toBe(true);
  });

  it('rejects non-workspace scope', () => {
    const result = DerivedPrincipleSchema.safeParse({
      ...validPrinciple,
      scope: {
        level: 'project',
        workspaceId: '11111111-1111-1111-1111-111111111111',
        projectId: '22222222-2222-2222-2222-222222222222',
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts derived origin with derivedFrom', () => {
    const result = DerivedPrincipleSchema.safeParse({
      ...validPrinciple,
      origin: 'derived',
      derivedFrom: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    });
    expect(result.success).toBe(true);
  });
});

describe('EvidenceBundle Schema', () => {
  const validEvidence = {
    carrierStage: 'context-pack',
    carrierQuote: 'Use template literals for SQL',
    carrierQuoteType: 'verbatim',
    carrierLocation: 'context-pack.md#section-3',
    carrierInstructionKind: 'explicitly_harmful',
    hasCitation: true,
    citedSources: ['docs/sql-guide.md'],
    sourceRetrievable: true,
    sourceAgreesWithCarrier: false,
    mandatoryDocMissing: false,
    vaguenessSignals: [],
    hasTestableAcceptanceCriteria: true,
    conflictSignals: [],
  };

  it('accepts valid evidence bundle', () => {
    const result = EvidenceBundleSchema.safeParse(validEvidence);
    expect(result.success).toBe(true);
  });

  it('requires carrierInstructionKind', () => {
    const { carrierInstructionKind, ...withoutKind } = validEvidence;
    const result = EvidenceBundleSchema.safeParse(withoutKind);
    expect(result.success).toBe(false);
  });
});

describe('ProvisionalAlert Schema', () => {
  const validAlert = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    workspaceId: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
    findingId: 'finding-123',
    issueId: 'PROJ-123',
    message: 'Critical security issue detected',
    touches: ['database', 'user_input'],
    injectInto: 'both',
    expiresAt: '2026-02-01T00:00:00.000Z',
    status: 'active',
    createdAt: '2026-01-18T00:00:00.000Z',
  };

  it('accepts valid alert', () => {
    const result = ProvisionalAlertSchema.safeParse(validAlert);
    expect(result.success).toBe(true);
  });

  it('accepts promoted status with pattern ID', () => {
    const result = ProvisionalAlertSchema.safeParse({
      ...validAlert,
      status: 'promoted',
      promotedToPatternId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    });
    expect(result.success).toBe(true);
  });
});

describe('KillSwitchStatus Schema', () => {
  const validStatus = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    workspaceId: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
    state: 'active',
    reason: null,
    enteredAt: null,
    autoResumeAt: null,
    createdAt: '2026-01-18T00:00:00.000Z',
    updatedAt: '2026-01-18T00:00:00.000Z',
  };

  it('accepts valid active status', () => {
    const result = KillSwitchStatusSchema.safeParse(validStatus);
    expect(result.success).toBe(true);
  });

  it('accepts inferred_paused state', () => {
    const result = KillSwitchStatusSchema.safeParse({
      ...validStatus,
      state: 'inferred_paused',
      reason: 'High inferred ratio',
      enteredAt: '2026-01-18T00:00:00.000Z',
      autoResumeAt: '2026-01-25T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts fully_paused state', () => {
    const result = KillSwitchStatusSchema.safeParse({
      ...validStatus,
      state: 'fully_paused',
      reason: 'Low precision',
      enteredAt: '2026-01-18T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid state', () => {
    const result = KillSwitchStatusSchema.safeParse({
      ...validStatus,
      state: 'paused',
    });
    expect(result.success).toBe(false);
  });
});
