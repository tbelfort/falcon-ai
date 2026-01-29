/**
 * Tests for the Deterministic Failure Mode Resolver.
 *
 * Tests each step of the decision tree:
 * A: Synthesis drift detection
 * B: Missing mandatory document
 * C: Unresolved conflicts
 * D: Ambiguity vs Incompleteness scoring
 * E: Default based on carrierInstructionKind
 */

import { describe, it, expect } from 'vitest';
import { resolveFailureMode } from '../../../src/guardrail/attribution/failure-mode-resolver.js';
import type { EvidenceBundle } from '../../../src/guardrail/schemas/index.js';

/**
 * Base evidence for tests - represents a common case.
 */
const baseEvidence: EvidenceBundle = {
  carrierStage: 'context-pack',
  carrierQuote: 'Use template literals for SQL queries',
  carrierQuoteType: 'verbatim',
  carrierInstructionKind: 'explicitly_harmful',
  carrierLocation: 'Section 4.2',
  hasCitation: false,
  citedSources: [],
  sourceRetrievable: false,
  sourceAgreesWithCarrier: null,
  mandatoryDocMissing: false,
  missingDocId: undefined,
  vaguenessSignals: [],
  hasTestableAcceptanceCriteria: true,
  conflictSignals: [],
};

describe('resolveFailureMode', () => {
  describe('Step A: Synthesis Drift', () => {
    it('returns synthesis_drift when source disagrees with carrier', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        hasCitation: true,
        citedSources: ['DB_PATTERNS.md'],
        sourceRetrievable: true,
        sourceAgreesWithCarrier: false,
      });

      expect(result.failureMode).toBe('synthesis_drift');
      expect(result.reasoning).toContain('disagrees');
      expect(result.confidenceModifier).toBe(0);
    });

    it('returns incorrect with suspected drift when source unretrievable', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        hasCitation: true,
        citedSources: ['DELETED.md'],
        sourceRetrievable: false,
      });

      expect(result.failureMode).toBe('incorrect');
      expect(result.flags.suspectedSynthesisDrift).toBe(true);
      expect(result.confidenceModifier).toBe(-0.15);
      expect(result.reasoning).toContain('suspected');
    });

    it('continues if source agrees with carrier', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        hasCitation: true,
        citedSources: ['DB_PATTERNS.md'],
        sourceRetrievable: true,
        sourceAgreesWithCarrier: true,
      });

      // When source agrees, guidance exists but issue occurred anyway.
      // With citations present, step D's incompletenessScore wins (score: 2)
      // because hasCitation + citedSources.length > 0 adds 1, and
      // vaguenessSignals.length == 0 with verbatim quote adds 1.
      expect(result.failureMode).toBe('incomplete');
      expect(result.flags.suspectedSynthesisDrift).toBe(false);
    });
  });

  describe('Step B: Missing Reference', () => {
    it('returns missing_reference when mandatory doc missing', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        mandatoryDocMissing: true,
        missingDocId: 'SECURITY.md',
      });

      expect(result.failureMode).toBe('missing_reference');
      expect(result.reasoning).toContain('SECURITY.md');
    });

    it('returns missing_reference even without specific docId', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        mandatoryDocMissing: true,
      });

      expect(result.failureMode).toBe('missing_reference');
      expect(result.reasoning).toContain('unknown');
    });
  });

  describe('Step C: Conflicts', () => {
    it('returns conflict_unresolved when conflicts exist', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        conflictSignals: [
          {
            docA: 'ARCH.md',
            docB: 'SECURITY.md',
            topic: 'SQL handling',
          },
        ],
      });

      expect(result.failureMode).toBe('conflict_unresolved');
      expect(result.reasoning).toContain('ARCH.md vs SECURITY.md');
      expect(result.reasoning).toContain('SQL handling');
    });

    it('includes multiple conflicts in reasoning', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        conflictSignals: [
          { docA: 'ARCH.md', docB: 'SECURITY.md', topic: 'SQL handling' },
          { docA: 'API.md', docB: 'DB.md', topic: 'Connection pooling' },
        ],
      });

      expect(result.failureMode).toBe('conflict_unresolved');
      expect(result.reasoning).toContain('ARCH.md vs SECURITY.md');
      expect(result.reasoning).toContain('API.md vs DB.md');
    });
  });

  describe('Step D: Ambiguous vs Incomplete', () => {
    it('returns ambiguous when vagueness signals dominate', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierInstructionKind: 'benign_but_missing_guardrails',
        vaguenessSignals: ['appropriately', 'robust', 'as needed'],
        hasTestableAcceptanceCriteria: false,
      });

      expect(result.failureMode).toBe('ambiguous');
      expect(result.reasoning).toContain('Ambiguity');
    });

    it('returns incomplete when inferred quote dominates', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'inferred',
        carrierInstructionKind: 'unknown',
        carrierQuote: 'No explicit guidance found for SQL parameterization',
      });

      expect(result.failureMode).toBe('incomplete');
      expect(result.reasoning).toContain('Incompleteness');
    });

    it('handles tie between ambiguity and incompleteness', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'verbatim',
        carrierInstructionKind: 'unknown',
        vaguenessSignals: ['appropriately'],
        hasTestableAcceptanceCriteria: false,
        hasCitation: true,
        citedSources: ['SOME.md'],
        sourceRetrievable: true,
        sourceAgreesWithCarrier: true,
      });

      // With low scores, falls through to step E
      expect(['ambiguous', 'incomplete']).toContain(result.failureMode);
    });
  });

  describe('Step E: Default based on carrierInstructionKind', () => {
    it('returns incorrect for explicitly_harmful instruction', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'verbatim',
        carrierInstructionKind: 'explicitly_harmful',
      });

      expect(result.failureMode).toBe('incorrect');
      expect(result.reasoning).toContain('verbatim');
      expect(result.reasoning).toContain('explicitly harmful');
    });

    it('returns incomplete for benign_but_missing_guardrails instruction', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'verbatim',
        carrierInstructionKind: 'benign_but_missing_guardrails',
      });

      expect(result.failureMode).toBe('incomplete');
      expect(result.reasoning).toContain('benign but missing guardrails');
    });

    it('returns incomplete for descriptive instruction', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'paraphrase',
        carrierInstructionKind: 'descriptive',
      });

      expect(result.failureMode).toBe('incomplete');
      expect(result.reasoning).toContain('descriptive');
    });

    it('returns incomplete for unknown instruction kind', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'verbatim',
        carrierInstructionKind: 'unknown',
      });

      expect(result.failureMode).toBe('incomplete');
      expect(result.reasoning).toContain('unknown');
    });

    it('returns incomplete for inferred quote (no direct guidance)', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'inferred',
        carrierInstructionKind: 'unknown',
      });

      // Inferred quote gives incompletenessScore of 3, which wins in step D
      expect(result.failureMode).toBe('incomplete');
      expect(result.reasoning).toContain('Incompleteness');
    });

    it('handles paraphrase quote with explicitly harmful', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'paraphrase',
        carrierInstructionKind: 'explicitly_harmful',
      });

      expect(result.failureMode).toBe('incorrect');
      expect(result.reasoning).toContain('paraphrase');
    });
  });

  describe('Decision tree priority', () => {
    it('synthesis_drift takes priority over missing_reference', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        hasCitation: true,
        sourceRetrievable: true,
        sourceAgreesWithCarrier: false,
        mandatoryDocMissing: true,
      });

      expect(result.failureMode).toBe('synthesis_drift');
    });

    it('missing_reference takes priority over conflicts', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        mandatoryDocMissing: true,
        conflictSignals: [{ docA: 'A.md', docB: 'B.md', topic: 'test' }],
      });

      expect(result.failureMode).toBe('missing_reference');
    });

    it('conflicts take priority over ambiguity/incompleteness', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        conflictSignals: [{ docA: 'A.md', docB: 'B.md', topic: 'test' }],
        vaguenessSignals: ['appropriately', 'robust', 'as needed'],
        hasTestableAcceptanceCriteria: false,
      });

      expect(result.failureMode).toBe('conflict_unresolved');
    });
  });

  describe('Edge cases', () => {
    it('handles empty citedSources array', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        hasCitation: false,
        citedSources: [],
      });

      // Should fall through to step E
      expect(result).toBeDefined();
      expect(result.failureMode).toBeDefined();
    });

    it('handles null sourceAgreesWithCarrier', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        hasCitation: true,
        citedSources: ['test.md'],
        sourceRetrievable: true,
        sourceAgreesWithCarrier: null,
      });

      // null means agreement wasn't checked, should continue
      expect(result.failureMode).not.toBe('synthesis_drift');
    });
  });
});
