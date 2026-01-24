/**
 * Deterministic Failure Mode Resolver
 *
 * Implements a decision tree to resolve failureMode from evidence features.
 * This is NOT LLM judgment - it's a deterministic function that maps
 * evidence features to failure modes.
 *
 * Decision Tree Steps:
 * A: Check for synthesis drift (source disagrees with carrier)
 * B: Check for missing mandatory document reference
 * C: Check for unresolved conflicts between documents
 * D: Ambiguity vs Incompleteness scoring
 * E: Default based on carrierInstructionKind
 */

import type { EvidenceBundle, FailureMode } from '../schemas/index.js';

/**
 * Result from the failure mode resolver.
 */
export interface ResolverResult {
  /** The resolved failure mode */
  failureMode: FailureMode;
  /** Confidence modifier (-1.0 to +1.0) */
  confidenceModifier: number;
  /** Additional flags for special cases */
  flags: {
    /** True if synthesis drift is suspected but not proven */
    suspectedSynthesisDrift: boolean;
  };
  /** Human-readable reasoning for debugging */
  reasoning: string;
}

/**
 * Deterministic decision tree for resolving failureMode from evidence.
 *
 * IMPORTANT: This is NOT LLM judgment. It's a deterministic function
 * that maps evidence features to failure modes.
 *
 * @param evidence - The EvidenceBundle from the Attribution Agent
 * @returns The resolved failure mode with reasoning
 */
export function resolveFailureMode(evidence: EvidenceBundle): ResolverResult {
  const result: ResolverResult = {
    failureMode: 'incomplete',
    confidenceModifier: 0,
    flags: { suspectedSynthesisDrift: false },
    reasoning: '',
  };

  // ========================================
  // STEP A: Can we prove synthesis drift?
  // ========================================

  if (evidence.hasCitation && evidence.sourceRetrievable) {
    if (evidence.sourceAgreesWithCarrier === false) {
      // Source disagrees with carrier - synthesis drift PROVEN
      result.failureMode = 'synthesis_drift';
      result.reasoning = 'Source disagrees with carrier - carrier distorted source meaning';
      return result;
    }
  }

  if (evidence.hasCitation && !evidence.sourceRetrievable) {
    // Citation exists but can't retrieve source - SUSPECTED drift
    result.failureMode = 'incorrect';
    result.flags.suspectedSynthesisDrift = true;
    result.confidenceModifier = -0.15;
    result.reasoning =
      'Cannot verify source - suspected synthesis drift, treating as incorrect with confidence penalty';
    return result;
  }

  // ========================================
  // STEP B: Is mandatory doc missing?
  // ========================================

  if (evidence.mandatoryDocMissing) {
    result.failureMode = 'missing_reference';
    result.reasoning = `Mandatory document not referenced: ${evidence.missingDocId || 'unknown'}`;
    return result;
  }

  // ========================================
  // STEP C: Are there unresolved conflicts?
  // ========================================

  if (evidence.conflictSignals.length > 0) {
    result.failureMode = 'conflict_unresolved';
    const conflicts = evidence.conflictSignals
      .map((c) => `${c.docA} vs ${c.docB} on "${c.topic}"`)
      .join('; ');
    result.reasoning = `Unresolved conflicts detected: ${conflicts}`;
    return result;
  }

  // ========================================
  // STEP D: Ambiguous vs Incomplete
  // ========================================

  const ambiguityScore = calculateAmbiguityScore(evidence);
  const incompletenessScore = calculateIncompletenessScore(evidence);

  if (ambiguityScore > incompletenessScore && ambiguityScore >= 2) {
    result.failureMode = 'ambiguous';
    result.reasoning =
      `Ambiguity signals dominate (score: ${ambiguityScore} vs ${incompletenessScore}): ` +
      `vagueness=${evidence.vaguenessSignals.length}, testable=${evidence.hasTestableAcceptanceCriteria}`;
    return result;
  }

  if (incompletenessScore > ambiguityScore && incompletenessScore >= 2) {
    result.failureMode = 'incomplete';
    result.reasoning = `Incompleteness signals dominate (score: ${incompletenessScore} vs ${ambiguityScore})`;
    return result;
  }

  // ========================================
  // STEP E: Default based on carrierInstructionKind
  // ========================================

  if (
    evidence.carrierQuoteType === 'verbatim' ||
    evidence.carrierQuoteType === 'paraphrase'
  ) {
    // Found specific quote - determine failureMode based on carrierInstructionKind
    switch (evidence.carrierInstructionKind) {
      case 'explicitly_harmful':
        // Guidance actively instructs harmful behavior
        result.failureMode = 'incorrect';
        result.reasoning = `Found ${evidence.carrierQuoteType} quote with explicitly harmful instruction`;
        break;
      case 'benign_but_missing_guardrails':
        // Guidance is not harmful but lacks security guardrails
        result.failureMode = 'incomplete';
        result.reasoning = `Found ${evidence.carrierQuoteType} quote that is benign but missing guardrails`;
        break;
      case 'descriptive':
        // Guidance describes behavior without prescribing it
        result.failureMode = 'incomplete';
        result.reasoning = `Found ${evidence.carrierQuoteType} quote that is descriptive only`;
        break;
      case 'unknown':
      default:
        // Cannot determine instruction kind - default to incomplete
        result.failureMode = 'incomplete';
        result.reasoning = `Found ${evidence.carrierQuoteType} quote but instruction kind is unknown`;
        break;
    }
  } else {
    // Inferred - no direct quote found
    result.failureMode = 'incomplete';
    result.reasoning = 'No direct guidance found (inferred) - treating as incomplete';
  }

  return result;
}

/**
 * Calculate ambiguity score from evidence signals.
 *
 * Signals that indicate ambiguity:
 * - Multiple vagueness signals (words like "appropriately", "robust")
 * - No testable acceptance criteria
 */
function calculateAmbiguityScore(evidence: EvidenceBundle): number {
  let score = 0;

  // Multiple vagueness signals indicate ambiguity
  if (evidence.vaguenessSignals.length >= 3) {
    score += 3;
  } else if (evidence.vaguenessSignals.length >= 2) {
    score += 2;
  } else if (evidence.vaguenessSignals.length === 1) {
    score += 1;
  }

  // No testable acceptance criteria
  if (!evidence.hasTestableAcceptanceCriteria) {
    score += 1;
  }

  return score;
}

/**
 * Calculate incompleteness score from evidence signals.
 *
 * Signals that indicate incompleteness:
 * - Inferred quote type (missing guidance)
 * - Has citations but issue still occurred
 * - No vagueness (guidance was specific but incomplete)
 */
function calculateIncompletenessScore(evidence: EvidenceBundle): number {
  let score = 0;

  // Inferred quote type suggests missing guidance
  if (evidence.carrierQuoteType === 'inferred') {
    score += 3;
  }

  // Has citations but they don't cover the issue
  if (evidence.hasCitation && evidence.citedSources.length > 0) {
    // Guidance exists and cites sources, but issue still occurred
    // Suggests the guidance was incomplete, not wrong
    score += 1;
  }

  // No vagueness (guidance was specific but incomplete)
  if (
    evidence.vaguenessSignals.length === 0 &&
    evidence.carrierQuoteType !== 'inferred'
  ) {
    score += 1;
  }

  return score;
}

/**
 * Get a human-readable description of a failure mode.
 */
export function describeFailureMode(mode: FailureMode): string {
  const descriptions: Record<FailureMode, string> = {
    incorrect: 'Guidance explicitly instructed incorrect behavior',
    incomplete: 'Guidance omitted a necessary constraint or guardrail',
    missing_reference: 'Mandatory documentation was not referenced',
    ambiguous: 'Guidance admits multiple reasonable interpretations',
    conflict_unresolved: 'Contradictory guidance was not reconciled',
    synthesis_drift: 'Carrier distorted the meaning of source documentation',
  };
  return descriptions[mode];
}
