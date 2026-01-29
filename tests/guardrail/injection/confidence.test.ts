import { describe, it, expect } from 'vitest';
import {
  computeAttributionConfidence,
  computeInjectionPriority,
  computePatternStats,
  type PatternStats,
} from '../../../src/guardrail/injection/confidence.js';
import type { PatternDefinition, TaskProfile, Touch, Severity } from '../../../src/guardrail/schemas/index.js';

const basePattern: PatternDefinition = {
  id: 'test-id',
  scope: {
    level: 'project',
    workspaceId: 'ws-123',
    projectId: 'proj-456',
  },
  patternKey: 'a'.repeat(64),
  contentHash: 'a'.repeat(64),
  patternContent: 'Test pattern',
  failureMode: 'incorrect',
  findingCategory: 'security',
  severity: 'HIGH',
  severityMax: 'HIGH',
  alternative: 'Do this instead',
  carrierStage: 'context-pack',
  primaryCarrierQuoteType: 'verbatim',
  technologies: ['sql'],
  taskTypes: ['api'],
  touches: ['database', 'user_input'],
  status: 'active',
  permanent: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseStats: PatternStats = {
  totalOccurrences: 1,
  activeOccurrences: 1,
  lastSeenActive: new Date().toISOString(),
  injectionCount: 0,
  adherenceRate: null,
};

const baseTaskProfile: TaskProfile = {
  touches: ['database', 'api'],
  technologies: ['sql', 'postgres'],
  taskTypes: ['api'],
  confidence: 0.8,
};

describe('computeAttributionConfidence', () => {
  it('returns 0.75 base for verbatim quote', () => {
    const confidence = computeAttributionConfidence(basePattern, baseStats);
    expect(confidence).toBeCloseTo(0.75, 2);
  });

  it('returns 0.55 base for paraphrase quote', () => {
    const pattern = { ...basePattern, primaryCarrierQuoteType: 'paraphrase' as const };
    const confidence = computeAttributionConfidence(pattern, baseStats);
    expect(confidence).toBeCloseTo(0.55, 2);
  });

  it('returns 0.40 base for inferred quote', () => {
    const pattern = { ...basePattern, primaryCarrierQuoteType: 'inferred' as const };
    const confidence = computeAttributionConfidence(pattern, baseStats);
    expect(confidence).toBeCloseTo(0.4, 2);
  });

  it('adds occurrence boost', () => {
    const stats = { ...baseStats, activeOccurrences: 3 };
    const confidenceWith1 = computeAttributionConfidence(basePattern, baseStats);
    const confidenceWith3 = computeAttributionConfidence(basePattern, stats);
    expect(confidenceWith3).toBeGreaterThan(confidenceWith1);
    expect(confidenceWith3 - confidenceWith1).toBeCloseTo(0.1, 2); // 2 extra * 0.05
  });

  it('caps occurrence boost at 5 extra', () => {
    const stats6 = { ...baseStats, activeOccurrences: 6 };
    const stats10 = { ...baseStats, activeOccurrences: 10 };
    const confidence6 = computeAttributionConfidence(basePattern, stats6);
    const confidence10 = computeAttributionConfidence(basePattern, stats10);
    expect(confidence6).toBe(confidence10); // Both capped
  });

  it('applies decay penalty', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45); // 45 days ago
    const statsOld = { ...baseStats, lastSeenActive: oldDate.toISOString() };

    const confidenceNew = computeAttributionConfidence(basePattern, baseStats);
    const confidenceOld = computeAttributionConfidence(basePattern, statsOld);
    expect(confidenceOld).toBeLessThan(confidenceNew);
  });

  it('skips decay for permanent patterns', () => {
    const permanentPattern = { ...basePattern, permanent: true };
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 180);
    const statsOld = { ...baseStats, lastSeenActive: oldDate.toISOString() };

    const confidenceNew = computeAttributionConfidence(permanentPattern, baseStats);
    const confidenceOld = computeAttributionConfidence(permanentPattern, statsOld);
    expect(confidenceNew).toBe(confidenceOld);
  });

  it('applies suspected drift penalty', () => {
    const confidenceNormal = computeAttributionConfidence(basePattern, baseStats);
    const confidenceDrift = computeAttributionConfidence(basePattern, baseStats, {
      suspectedSynthesisDrift: true,
    });
    expect(confidenceDrift).toBe(confidenceNormal - 0.15);
  });
});

describe('computeInjectionPriority', () => {
  it('increases with severity', () => {
    const criticalPattern = { ...basePattern, severityMax: 'CRITICAL' as Severity };
    const lowPattern = { ...basePattern, severityMax: 'LOW' as Severity };

    const priorityCritical = computeInjectionPriority(
      criticalPattern,
      baseTaskProfile,
      baseStats
    );
    const priorityLow = computeInjectionPriority(lowPattern, baseTaskProfile, baseStats);

    expect(priorityCritical).toBeGreaterThan(priorityLow);
  });

  it('increases with touch overlap', () => {
    const matchingProfile = {
      ...baseTaskProfile,
      touches: ['database', 'user_input'] as Touch[],
    };
    const noMatchProfile = { ...baseTaskProfile, touches: ['logging'] as Touch[] };

    const priorityMatch = computeInjectionPriority(basePattern, matchingProfile, baseStats);
    const priorityNoMatch = computeInjectionPriority(basePattern, noMatchProfile, baseStats);

    expect(priorityMatch).toBeGreaterThan(priorityNoMatch);
  });

  it('applies cross-project penalty', () => {
    const localPattern = basePattern;
    const crossPattern = { ...basePattern, _crossProjectPenalty: true as const };

    const priorityLocal = computeInjectionPriority(localPattern, baseTaskProfile, baseStats);
    const priorityCross = computeInjectionPriority(crossPattern, baseTaskProfile, baseStats);

    expect(priorityCross).toBeLessThan(priorityLocal);
    expect(priorityCross).toBeCloseTo(priorityLocal * 0.95, 2);
  });
});

describe('computePatternStats', () => {
  it('computes stats from occurrences', () => {
    const now = new Date().toISOString();
    const mockRepo = {
      findByPatternId: () => [
        { status: 'active', createdAt: now, wasInjected: true, wasAdheredTo: true },
        { status: 'active', createdAt: now, wasInjected: true, wasAdheredTo: false },
        { status: 'inactive', createdAt: now, wasInjected: false, wasAdheredTo: null },
      ],
    };

    const stats = computePatternStats('test-pattern', mockRepo);

    expect(stats.totalOccurrences).toBe(3);
    expect(stats.activeOccurrences).toBe(2);
    expect(stats.injectionCount).toBe(2);
    expect(stats.adherenceRate).toBe(0.5);
  });

  it('handles empty occurrences', () => {
    const mockRepo = {
      findByPatternId: () => [],
    };

    const stats = computePatternStats('test-pattern', mockRepo);

    expect(stats.totalOccurrences).toBe(0);
    expect(stats.activeOccurrences).toBe(0);
    expect(stats.adherenceRate).toBeNull();
  });
});
