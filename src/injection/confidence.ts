/**
 * Confidence and Priority Calculation
 *
 * Computes attribution confidence and injection priority for patterns.
 * These values are NEVER stored - always computed from occurrences.
 */

import type { PatternDefinition, TaskProfile, Touch, Severity } from '../schemas/index.js';

export interface PatternStats {
  totalOccurrences: number;
  activeOccurrences: number;
  lastSeenActive: string | null;
  injectionCount: number;
  adherenceRate: number | null;
}

/**
 * Interface for occurrence repository (subset of actual repo for testing).
 */
export interface OccurrenceRepoLike {
  findByPatternId(
    id: string
  ): Array<{
    status: string;
    createdAt: string;
    wasInjected: boolean;
    wasAdheredTo: boolean | null;
  }>;
}

/**
 * Compute statistics for a pattern.
 * These are NEVER stored - always computed from occurrences.
 */
export function computePatternStats(
  patternId: string,
  occurrenceRepo: OccurrenceRepoLike
): PatternStats {
  const occurrences = occurrenceRepo.findByPatternId(patternId);

  const activeOccurrences = occurrences.filter((o) => o.status === 'active');
  const injectedOccurrences = occurrences.filter((o) => o.wasInjected);
  const adheredOccurrences = injectedOccurrences.filter((o) => o.wasAdheredTo === true);

  const lastActive = activeOccurrences
    .map((o) => new Date(o.createdAt))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    totalOccurrences: occurrences.length,
    activeOccurrences: activeOccurrences.length,
    lastSeenActive: lastActive?.toISOString() || null,
    injectionCount: injectedOccurrences.length,
    adherenceRate:
      injectedOccurrences.length > 0
        ? adheredOccurrences.length / injectedOccurrences.length
        : null,
  };
}

/**
 * Compute attribution confidence for a pattern.
 * See Spec Section 4.1.
 *
 * attributionConfidence = CLAMP(
 *   evidenceQualityBase
 *   + occurrenceBoost
 *   - decayPenalty
 *   + confidenceModifiers,
 *   0.0, 1.0
 * )
 */
export function computeAttributionConfidence(
  pattern: PatternDefinition,
  stats: PatternStats,
  flags?: { suspectedSynthesisDrift?: boolean }
): number {
  // Evidence quality base
  let confidence: number;
  switch (pattern.primaryCarrierQuoteType) {
    case 'verbatim':
      confidence = 0.75;
      break;
    case 'paraphrase':
      confidence = 0.55;
      break;
    case 'inferred':
      confidence = 0.4;
      break;
  }

  // Occurrence boost: min((activeOccurrenceCount - 1), 5) * 0.05
  // First occurrence = no boost, max boost = 0.25 at 6+ occurrences
  const occurrenceBoost = Math.min(stats.activeOccurrences - 1, 5) * 0.05;
  confidence += occurrenceBoost;

  // Decay penalty (only if not permanent)
  if (!pattern.permanent && stats.lastSeenActive) {
    const daysSince = daysSinceDate(stats.lastSeenActive);
    // 90-day half-life, max penalty = 0.15
    const decayPenalty = Math.min(daysSince / 90, 1.0) * 0.15;
    confidence -= decayPenalty;
  }

  // Confidence modifiers
  if (flags?.suspectedSynthesisDrift) {
    confidence -= 0.15;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Pattern with optional cross-project penalty marker.
 */
export type PatternWithCrossProjectMarker = PatternDefinition & {
  _crossProjectPenalty?: boolean;
};

/**
 * Compute injection priority for a pattern.
 * See Spec Section 4.2.
 *
 * injectionPriority =
 *   attributionConfidence
 *   * severityWeight
 *   * relevanceWeight
 *   * recencyWeight
 */
export function computeInjectionPriority(
  pattern: PatternWithCrossProjectMarker,
  taskProfile: TaskProfile,
  stats: PatternStats,
  flags?: { suspectedSynthesisDrift?: boolean }
): number {
  const attributionConfidence = computeAttributionConfidence(pattern, stats, flags);

  // Severity weight
  const severityWeight: Record<Severity, number> = {
    CRITICAL: 1.0,
    HIGH: 0.9,
    MEDIUM: 0.7,
    LOW: 0.5,
  };

  // Relevance weight (capped linear)
  // v1.0: touches weighted higher than tech overlaps
  const touchOverlaps = pattern.touches.filter((t) =>
    taskProfile.touches.includes(t as Touch)
  ).length;
  const techOverlaps = pattern.technologies.filter((t) =>
    taskProfile.technologies.includes(t)
  ).length;
  const relevanceWeight = Math.min(1.0 + 0.15 * touchOverlaps + 0.05 * techOverlaps, 1.5);

  // Recency weight
  const recencyWeight = stats.lastSeenActive
    ? computeRecencyWeight(stats.lastSeenActive)
    : 0.8;

  // v1.2: Cross-project penalty - patterns from other projects are slightly downweighted
  // Main spec Section 5.1: crossProjectPenalty = 0.05, applied as (1 - 0.05) = 0.95x
  const crossProjectMultiplier = pattern._crossProjectPenalty ? 0.95 : 1.0;

  // Use severityMax for injection priority (v1.0: reflects worst observed impact)
  return (
    attributionConfidence *
    severityWeight[pattern.severityMax] *
    relevanceWeight *
    recencyWeight *
    crossProjectMultiplier
  );
}

/**
 * Compute recency weight based on days since last seen.
 */
function computeRecencyWeight(lastSeen: string): number {
  const days = daysSinceDate(lastSeen);
  if (days <= 7) return 1.0;
  if (days <= 30) return 0.95;
  if (days <= 90) return 0.9;
  return 0.8;
}

/**
 * Calculate days since a given ISO date.
 */
export function daysSinceDate(isoDate: string): number {
  const then = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
