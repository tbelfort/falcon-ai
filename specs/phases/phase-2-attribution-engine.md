# Phase 2: Attribution Engine

**Parent Document:** `specs/implementation-plan-master.md` (v1.0)
**Dependencies:** Phase 1 (Data Layer)
**Outputs Required By:** Phase 4 (Integration)

---

## 1. Overview

This phase implements the Attribution Engine that:
- Extracts structured evidence from Context Pack and Spec documents
- Resolves failureMode deterministically (not via LLM judgment)
- Detects ExecutionNoncompliance before creating Patterns
- Orchestrates the full attribution flow

---

## 2. Deliverables Checklist

- [ ] `src/attribution/prompts/attribution-agent.ts` - Agent system/user prompts
- [ ] `src/attribution/agent.ts` - Attribution Agent runner
- [ ] `src/attribution/evidence-extractor.ts` - EvidenceBundle parsing/validation
- [ ] `src/attribution/failure-mode-resolver.ts` - Deterministic decision tree
- [ ] `src/attribution/noncompliance-checker.ts` - ExecutionNoncompliance detection
- [ ] `src/attribution/orchestrator.ts` - Full attribution orchestration
- [ ] `tests/attribution/failure-mode-resolver.test.ts` - Decision tree tests
- [ ] `tests/attribution/noncompliance-checker.test.ts` - Noncompliance tests
- [ ] `tests/attribution/orchestrator.test.ts` - Integration tests

---

## 3. Key Design Principle

**Evidence Features + Deterministic Resolver**

Instead of asking an LLM to "choose the failure mode," we:
1. Have the Attribution Agent output **structured evidence features**
2. Run a **deterministic decision tree** to resolve failureMode

Benefits:
- **Consistency:** Same evidence → same failureMode
- **Debuggability:** Can trace exactly why a decision was made
- **Reversibility:** Can improve rules without rewriting history

---

## 4. Attribution Agent

### 4.1 System Prompt

```typescript
// File: src/attribution/prompts/attribution-agent.ts

export const ATTRIBUTION_AGENT_SYSTEM_PROMPT = `
You are the Attribution Agent. Your job is to analyze confirmed PR review findings
and extract structured evidence about what guidance caused the problem.

## Your Task

For each confirmed finding, you will:
1. Search the Context Pack and Spec for the guidance that led to this problem
2. Extract structured evidence (not free-form judgment)
3. Trace provenance if the guidance cites sources

## Output Format

You MUST output a valid JSON object matching this schema:

\`\`\`json
{
  "carrierStage": "context-pack" | "spec",
  "carrierQuote": "The exact or paraphrased guidance text",
  "carrierQuoteType": "verbatim" | "paraphrase" | "inferred",
  "carrierInstructionKind": "explicitly_harmful" | "benign_but_missing_guardrails" | "descriptive" | "unknown",
  "carrierLocation": "Section X.Y or line reference",
  "hasCitation": true | false,
  "citedSources": ["source1.md", "source2.md"],
  "sourceRetrievable": true | false,
  "sourceAgreesWithCarrier": true | false | null,
  "mandatoryDocMissing": true | false,
  "missingDocId": "SECURITY.md" | null,
  "vaguenessSignals": ["appropriately", "robust", ...],
  "hasTestableAcceptanceCriteria": true | false,
  "conflictSignals": [
    {
      "docA": "source1.md",
      "docB": "source2.md",
      "topic": "SQL query construction",
      "excerptA": "...",
      "excerptB": "..."
    }
  ]
}
\`\`\`

## Field Definitions

### carrierQuoteType
- **verbatim**: You found the exact text in the document
- **paraphrase**: You found text that conveys the same meaning
- **inferred**: You couldn't find explicit text, but the guidance is implied by what's missing

### carrierInstructionKind
Classify the nature of the instruction found (only applicable when carrierQuoteType is verbatim or paraphrase):
- **explicitly_harmful**: The guidance actively instructs behavior that causes the security/correctness issue (e.g., "use string concatenation for SQL queries")
- **benign_but_missing_guardrails**: The guidance is not harmful but fails to include necessary security guardrails (e.g., "query the database" without mentioning parameterization)
- **descriptive**: The guidance describes behavior without prescribing it (e.g., "the system queries the database")
- **unknown**: You cannot determine the instruction kind from the context

### mandatoryDocMissing
Set to true if a document that MUST be referenced for this task type was not cited.
Mandatory docs by task type:
- auth/authz tasks → SECURITY.md, AUTH_PATTERNS.md
- database tasks → DB_PATTERNS.md, MIGRATIONS.md
- api tasks → API_DESIGN.md, ERROR_HANDLING.md
- schema changes → SCHEMA_CHANGES.md

### vaguenessSignals
Look for words like: "appropriately", "robust", "as needed", "consider", "may",
"should consider", "it depends", "typically", "usually", "might", "proper",
"reasonable", "sufficient"

### hasTestableAcceptanceCriteria
Does the guidance include specific, verifiable acceptance criteria?
- NOT testable: "Handle errors appropriately"
- Testable: "Return 400 status code with error body matching ErrorResponse schema"

## Important Instructions

1. Do NOT determine failureMode. That's done by a deterministic resolver.
2. Do NOT make subjective judgments. Extract evidence.
3. If you can't find guidance, set carrierQuoteType to "inferred" and describe what's missing.
4. Always check if the guidance cites sources, and if so, whether those sources agree.
5. Output ONLY valid JSON. No markdown, no explanation.
`;
```

### 4.2 User Prompt Template

```typescript
export function createAttributionUserPrompt(params: {
  finding: {
    title: string;
    description: string;
    scoutType: string;
    severity: string;
    evidence: string;
    location: { file: string; line?: number };
  };
  contextPack: string;
  spec: string;
}): string {
  return `
## Confirmed Finding

**Title:** ${params.finding.title}
**Scout:** ${params.finding.scoutType}
**Severity:** ${params.finding.severity}
**Location:** ${params.finding.location.file}${params.finding.location.line ? `:${params.finding.location.line}` : ''}

**Description:**
${params.finding.description}

**Evidence:**
${params.finding.evidence}

---

## Context Pack Content

${params.contextPack}

---

## Spec Content

${params.spec}

---

## Your Task

Analyze this finding and extract the EvidenceBundle. Output ONLY valid JSON.
`;
}
```

### 4.3 Agent Runner

```typescript
// File: src/attribution/agent.ts
import Anthropic from '@anthropic-ai/sdk';
import { EvidenceBundleSchema, type EvidenceBundle } from '../schemas';
import {
  ATTRIBUTION_AGENT_SYSTEM_PROMPT,
  createAttributionUserPrompt
} from './prompts/attribution-agent';

interface RunAttributionAgentInput {
  finding: {
    title: string;
    description: string;
    scoutType: string;
    severity: string;
    evidence: string;
    location: { file: string; line?: number };
  };
  contextPack: string;
  spec: string;
}

export async function runAttributionAgent(
  input: RunAttributionAgentInput
): Promise<EvidenceBundle> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: ATTRIBUTION_AGENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: createAttributionUserPrompt(input)
      }
    ]
  });

  // Extract text content
  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Attribution Agent');
  }

  // Parse and validate JSON
  let parsed: unknown;
  try {
    // Handle potential markdown code blocks
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Failed to parse Attribution Agent response as JSON: ${e}`);
  }

  // Validate with Zod
  const result = EvidenceBundleSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid EvidenceBundle: ${result.error.message}`);
  }

  return result.data;
}
```

---

## 5. Deterministic FailureMode Resolver

### 5.1 Decision Tree (Spec Section 3.3)

```typescript
// File: src/attribution/failure-mode-resolver.ts
import type { EvidenceBundle, FailureMode, CarrierInstructionKind } from '../schemas';

export interface ResolverResult {
  failureMode: FailureMode;
  confidenceModifier: number;
  flags: {
    suspectedSynthesisDrift: boolean;
  };
  reasoning: string; // For debugging
}

/**
 * Deterministic decision tree for resolving failureMode from evidence.
 *
 * IMPORTANT: This is NOT LLM judgment. It's a deterministic function
 * that maps evidence features to failure modes.
 */
export function resolveFailureMode(evidence: EvidenceBundle): ResolverResult {
  const result: ResolverResult = {
    failureMode: 'incomplete',
    confidenceModifier: 0,
    flags: { suspectedSynthesisDrift: false },
    reasoning: ''
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
    result.reasoning = 'Cannot verify source - suspected synthesis drift, treating as incorrect with confidence penalty';
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
      .map(c => `${c.docA} vs ${c.docB} on "${c.topic}"`)
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
    result.reasoning = `Ambiguity signals dominate (score: ${ambiguityScore} vs ${incompletenessScore}): ` +
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

  if (evidence.carrierQuoteType === 'verbatim' ||
      evidence.carrierQuoteType === 'paraphrase') {
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
  if (evidence.vaguenessSignals.length === 0 &&
      evidence.carrierQuoteType !== 'inferred') {
    score += 1;
  }

  return score;
}
```

### 5.2 Decision Tree Tests

```typescript
// File: tests/attribution/failure-mode-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveFailureMode } from '../../src/attribution/failure-mode-resolver';
import type { EvidenceBundle } from '../../src/schemas';

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
  vaguenessSignals: [],
  hasTestableAcceptanceCriteria: true,
  conflictSignals: []
};

describe('resolveFailureMode', () => {

  describe('Step A: Synthesis Drift', () => {
    it('returns synthesis_drift when source disagrees', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        hasCitation: true,
        citedSources: ['DB_PATTERNS.md'],
        sourceRetrievable: true,
        sourceAgreesWithCarrier: false
      });
      expect(result.failureMode).toBe('synthesis_drift');
    });

    it('returns incorrect with penalty when source unretrievable', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        hasCitation: true,
        citedSources: ['DELETED.md'],
        sourceRetrievable: false
      });
      expect(result.failureMode).toBe('incorrect');
      expect(result.flags.suspectedSynthesisDrift).toBe(true);
      expect(result.confidenceModifier).toBe(-0.15);
    });
  });

  describe('Step B: Missing Reference', () => {
    it('returns missing_reference when mandatory doc missing', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        mandatoryDocMissing: true,
        missingDocId: 'SECURITY.md'
      });
      expect(result.failureMode).toBe('missing_reference');
    });
  });

  describe('Step C: Conflicts', () => {
    it('returns conflict_unresolved when conflicts exist', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        conflictSignals: [{
          docA: 'ARCH.md',
          docB: 'SECURITY.md',
          topic: 'SQL handling'
        }]
      });
      expect(result.failureMode).toBe('conflict_unresolved');
    });
  });

  describe('Step D: Ambiguous vs Incomplete', () => {
    it('returns ambiguous when vagueness signals dominate', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        vaguenessSignals: ['appropriately', 'robust', 'as needed'],
        hasTestableAcceptanceCriteria: false
      });
      expect(result.failureMode).toBe('ambiguous');
    });

    it('returns incomplete when inferred quote', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'inferred',
        carrierQuote: 'No explicit guidance found for SQL parameterization'
      });
      expect(result.failureMode).toBe('incomplete');
    });
  });

  describe('Step E: Default based on carrierInstructionKind', () => {
    it('returns incorrect for explicitly_harmful instruction', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'verbatim',
        carrierInstructionKind: 'explicitly_harmful'
      });
      expect(result.failureMode).toBe('incorrect');
    });

    it('returns incomplete for benign_but_missing_guardrails instruction', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'verbatim',
        carrierInstructionKind: 'benign_but_missing_guardrails'
      });
      expect(result.failureMode).toBe('incomplete');
    });

    it('returns incomplete for descriptive instruction', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'paraphrase',
        carrierInstructionKind: 'descriptive'
      });
      expect(result.failureMode).toBe('incomplete');
    });

    it('returns incomplete for unknown instruction kind', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'verbatim',
        carrierInstructionKind: 'unknown'
      });
      expect(result.failureMode).toBe('incomplete');
    });

    it('returns incomplete for inferred quote (no direct guidance)', () => {
      const result = resolveFailureMode({
        ...baseEvidence,
        carrierQuoteType: 'inferred',
        carrierInstructionKind: 'unknown'
      });
      expect(result.failureMode).toBe('incomplete');
    });
  });
});
```

---

## 6. ExecutionNoncompliance Detection

### 6.1 Noncompliance Checker

```typescript
// File: src/attribution/noncompliance-checker.ts
import type {
  EvidenceBundle,
  ExecutionNoncompliance,
  NoncomplianceCause
} from '../schemas';

export interface NoncomplianceCheckResult {
  isNoncompliance: boolean;
  noncompliance?: Omit<ExecutionNoncompliance, 'id' | 'createdAt'>;
}

/**
 * Before creating a Pattern with failureMode='incomplete' or 'missing_reference',
 * search the full Context Pack and Spec for the allegedly missing guidance.
 *
 * If found: This is ExecutionNoncompliance (agent ignored correct guidance)
 * If not found: Proceed with Pattern creation
 */
export function checkForNoncompliance(params: {
  evidence: EvidenceBundle;
  resolvedFailureMode: string;
  contextPack: string;
  spec: string;
  finding: {
    id: string;
    issueId: string;
    prNumber: number;
    title: string;
    description: string;
  };
}): NoncomplianceCheckResult {
  // Only check for incomplete/missing_reference failure modes
  if (params.resolvedFailureMode !== 'incomplete' &&
      params.resolvedFailureMode !== 'missing_reference') {
    return { isNoncompliance: false };
  }

  // Extract keywords from the finding
  const keywords = extractKeywords(
    params.finding.title,
    params.finding.description
  );

  // Search both documents
  const contextPackMatch = searchDocument(params.contextPack, keywords);
  const specMatch = searchDocument(params.spec, keywords);

  const match = contextPackMatch || specMatch;

  if (match && match.relevanceScore >= 0.3) {
    // Guidance exists! This is execution noncompliance.
    const causes = analyzePossibleCauses(match, params.evidence);

    return {
      isNoncompliance: true,
      noncompliance: {
        findingId: params.finding.id,
        issueId: params.finding.issueId,
        prNumber: params.finding.prNumber,
        violatedGuidanceStage: contextPackMatch ? 'context-pack' : 'spec',
        violatedGuidanceLocation: match.location,
        violatedGuidanceExcerpt: match.excerpt,
        possibleCauses: causes
      }
    };
  }

  return { isNoncompliance: false };
}

interface DocumentMatch {
  location: string;
  excerpt: string;
  relevanceScore: number;
}

/**
 * Extract meaningful keywords from finding text.
 */
function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();

  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'can', 'and', 'but', 'or', 'if', 'this', 'that', 'these',
    'those', 'it', 'its', 'found', 'issue', 'error', 'bug', 'problem'
  ]);

  const words = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}

/**
 * Search document for keyword matches using sliding window.
 */
function searchDocument(doc: string, keywords: string[]): DocumentMatch | null {
  if (keywords.length === 0) return null;

  const lines = doc.split('\n');
  let bestMatch: DocumentMatch | null = null;
  let bestScore = 0;

  // Sliding window of 5 lines
  for (let i = 0; i < lines.length - 4; i++) {
    const window = lines.slice(i, i + 5).join('\n').toLowerCase();
    const matchedKeywords = keywords.filter(kw => window.includes(kw));
    const score = matchedKeywords.length;

    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = {
        location: `Lines ${i + 1}-${i + 5}`,
        excerpt: lines.slice(i, i + 5).join('\n').slice(0, 500),
        relevanceScore: score / keywords.length
      };
    }
  }

  return bestMatch;
}

/**
 * Analyze why guidance was ignored.
 *
 * NOTE (v1.0): 'ambiguity' was removed from NoncomplianceCause.
 * If guidance was ignored because it was ambiguous, this is a guidance problem,
 * not an execution problem. Route to:
 * - DocUpdateRequest(updateType='clarify_guidance') AND
 * - PatternDefinition(failureMode='ambiguous')
 * Do NOT create ExecutionNoncompliance for ambiguity cases.
 */
function analyzePossibleCauses(
  match: DocumentMatch,
  evidence: EvidenceBundle
): NoncomplianceCause[] {
  const causes: NoncomplianceCause[] = [];

  // If guidance was in a different section than expected
  if (!evidence.carrierLocation.includes(match.location)) {
    causes.push('salience');
  }

  // NOTE: vaguenessSignals indicate ambiguity, which is a GUIDANCE problem.
  // Don't add 'ambiguity' as a noncompliance cause - route to PatternDefinition instead.

  // Default to formatting if no other cause
  if (causes.length === 0) {
    causes.push('formatting');
  }

  return causes;
}
```

---

## 7. Attribution Orchestrator

### 7.1 Full Orchestration

```typescript
// File: src/attribution/orchestrator.ts
import type { Database } from 'better-sqlite3';
import type {
  PatternDefinition,
  PatternOccurrence,
  ExecutionNoncompliance,
  DocUpdateRequest,
  EvidenceBundle,
  DocFingerprint,
  FindingCategory,
  CarrierInstructionKind,
  ProvisionalAlert,
  SalienceIssue
} from '../schemas';
import { resolveFailureMode } from './failure-mode-resolver';
import { checkForNoncompliance } from './noncompliance-checker';
import { runAttributionAgent } from './agent';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { ExecutionNoncomplianceRepository } from '../storage/repositories/execution-noncompliance.repo';
import { DocUpdateRequestRepository } from '../storage/repositories/doc-update-request.repo';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo';
import { SalienceIssueRepository } from '../storage/repositories/salience-issue.repo';
import { ProvisionalAlertRepository } from '../storage/repositories/provisional-alert.repo';
import { createHash } from 'crypto';

export interface AttributionInput {
  finding: {
    id: string;
    issueId: string;
    prNumber: number;
    title: string;
    description: string;
    scoutType: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    evidence: string;
    location: { file: string; line?: number };
  };
  contextPack: {
    content: string;
    fingerprint: DocFingerprint;
  };
  spec: {
    content: string;
    fingerprint: DocFingerprint;
  };
}

export interface AttributionResult {
  type: 'pattern' | 'noncompliance' | 'doc_update_only' | 'provisional_alert';
  pattern?: PatternDefinition;
  occurrence?: PatternOccurrence;
  noncompliance?: ExecutionNoncompliance;
  docUpdateRequest?: DocUpdateRequest;
  provisionalAlert?: ProvisionalAlert;
  resolverResult?: {
    failureMode: string;
    reasoning: string;
  };
}

export class AttributionOrchestrator {
  private patternRepo: PatternDefinitionRepository;
  private occurrenceRepo: PatternOccurrenceRepository;
  private noncomplianceRepo: ExecutionNoncomplianceRepository;
  private docUpdateRepo: DocUpdateRequestRepository;
  private principleRepo: DerivedPrincipleRepository;
  private salienceIssueRepo: SalienceIssueRepository;
  private provisionalAlertRepo: ProvisionalAlertRepository;

  constructor(db: Database) {
    this.patternRepo = new PatternDefinitionRepository(db);
    this.occurrenceRepo = new PatternOccurrenceRepository(db);
    this.noncomplianceRepo = new ExecutionNoncomplianceRepository(db);
    this.docUpdateRepo = new DocUpdateRequestRepository(db);
    this.principleRepo = new DerivedPrincipleRepository(db);
    this.salienceIssueRepo = new SalienceIssueRepository(db);
    this.provisionalAlertRepo = new ProvisionalAlertRepository(db);
  }

  async attributeFinding(input: AttributionInput): Promise<AttributionResult> {
    // Step 1: Run Attribution Agent to extract evidence
    const evidence = await runAttributionAgent({
      finding: input.finding,
      contextPack: input.contextPack.content,
      spec: input.spec.content
    });

    // Step 2: Resolve failureMode deterministically
    const resolverResult = resolveFailureMode(evidence);

    // Step 3: Check for ExecutionNoncompliance
    const noncomplianceCheck = checkForNoncompliance({
      evidence,
      resolvedFailureMode: resolverResult.failureMode,
      contextPack: input.contextPack.content,
      spec: input.spec.content,
      finding: input.finding
    });

    if (noncomplianceCheck.isNoncompliance) {
      const noncompliance = this.noncomplianceRepo.create(
        noncomplianceCheck.noncompliance!
      );

      // Step 3b: Track salience issues (v1.0 schema)
      // SalienceIssue aggregates noncompliance events when same guidance is ignored 3+ times in 30 days
      if (noncomplianceCheck.noncompliance!.possibleCauses.includes('salience') ||
          noncomplianceCheck.noncompliance!.possibleCauses.includes('formatting')) {
        // Compute guidanceLocationHash for deduplication
        const guidanceLocationHash = createHash('sha256')
          .update(`${noncompliance.violatedGuidanceStage}|${noncompliance.violatedGuidanceLocation}|${noncompliance.violatedGuidanceExcerpt}`)
          .digest('hex');

        // Find existing SalienceIssue or create new one
        const existing = this.salienceIssueRepo.findByLocationHash(guidanceLocationHash);
        if (existing && existing.status === 'pending') {
          // Append to existing issue
          this.salienceIssueRepo.update(existing.id, {
            occurrenceCount: existing.occurrenceCount + 1,
            noncomplianceIds: [...existing.noncomplianceIds, noncompliance.id]
          });
        } else {
          // Create new SalienceIssue (occurrenceCount starts at 1, triggers at 3)
          this.salienceIssueRepo.create({
            guidanceLocationHash,
            guidanceStage: noncompliance.violatedGuidanceStage,
            guidanceLocation: noncompliance.violatedGuidanceLocation,
            guidanceExcerpt: noncompliance.violatedGuidanceExcerpt,
            occurrenceCount: 1,
            windowDays: 30,
            noncomplianceIds: [noncompliance.id],
            status: 'pending'
          });
        }
      }

      return {
        type: 'noncompliance',
        noncompliance,
        resolverResult: {
          failureMode: resolverResult.failureMode,
          reasoning: resolverResult.reasoning
        }
      };
    }

    // Step 4: Handle Decisions findings specially
    if (input.finding.scoutType === 'decisions') {
      return this.handleDecisionsFinding(input, evidence, resolverResult);
    }

    // Step 4b: Check for ProvisionalAlert (HIGH/CRITICAL security with inferred quote)
    // ProvisionalAlerts flag potential issues that need human review before becoming patterns
    const provisionalAlert = this.checkAndCreateProvisionalAlert(
      input, evidence, resolverResult
    );

    if (provisionalAlert) {
      // Don't create pattern yet - needs human review first
      return {
        type: 'provisional_alert',
        provisionalAlert,
        resolverResult: {
          failureMode: resolverResult.failureMode,
          reasoning: resolverResult.reasoning
        }
      };
    }

    // Step 5: Create or update pattern
    const { pattern, occurrence } = await this.createPatternAndOccurrence(
      input, evidence, resolverResult
    );

    return {
      type: 'pattern',
      pattern,
      occurrence,
      resolverResult: {
        failureMode: resolverResult.failureMode,
        reasoning: resolverResult.reasoning
      }
    };
  }

  private async handleDecisionsFinding(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ReturnType<typeof resolveFailureMode>
  ): Promise<AttributionResult> {
    // Decisions findings ALWAYS create DocUpdateRequest
    const docUpdateRequest = this.docUpdateRepo.create({
      findingId: input.finding.id,
      issueId: input.finding.issueId,
      findingCategory: 'compliance',
      scoutType: 'decisions',
      targetDoc: this.inferTargetDoc(evidence),
      updateType: 'add_decision',
      description: input.finding.description,
      status: 'pending'
    });

    // Only create pattern if recurring (3+) or high-risk
    const shouldCreatePattern = await this.shouldCreatePatternForDecision(
      evidence,
      input.finding.severity
    );

    if (!shouldCreatePattern) {
      return {
        type: 'doc_update_only',
        docUpdateRequest,
        resolverResult: {
          failureMode: resolverResult.failureMode,
          reasoning: resolverResult.reasoning
        }
      };
    }

    const { pattern, occurrence } = await this.createPatternAndOccurrence(
      input, evidence, resolverResult
    );

    return {
      type: 'pattern',
      pattern,
      occurrence,
      docUpdateRequest,
      resolverResult: {
        failureMode: resolverResult.failureMode,
        reasoning: resolverResult.reasoning
      }
    };
  }

  private async createPatternAndOccurrence(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ReturnType<typeof resolveFailureMode>
  ): Promise<{ pattern: PatternDefinition; occurrence: PatternOccurrence }> {
    const patternContent = evidence.carrierQuote;
    const normalizedContent = patternContent.replace(/\s+/g, ' ').trim();
    const findingCategory = this.mapScoutToCategory(input.finding.scoutType);

    // patternKey = SHA-256(carrierStage|patternContent|findingCategory) per v1.0 spec
    const patternKey = createHash('sha256')
      .update(`${evidence.carrierStage}|${normalizedContent}|${findingCategory}`)
      .digest('hex');

    // Check for existing pattern (deduplication by patternKey)
    let pattern = this.patternRepo.findByPatternKey(patternKey);

    if (pattern) {
      // Update severityMax if this occurrence has higher severity (v1.0)
      const severityOrder = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3 };
      const newSeverity = input.finding.severity;
      if (severityOrder[newSeverity] > severityOrder[pattern.severityMax]) {
        pattern = this.patternRepo.update(pattern.id, {
          severityMax: newSeverity
        })!;
      }

      // Update if this evidence is better
      if (this.isBetterEvidence(
        evidence.carrierQuoteType,
        pattern.primaryCarrierQuoteType
      )) {
        pattern = this.patternRepo.update(pattern.id, {
          primaryCarrierQuoteType: evidence.carrierQuoteType
        })!;
      }
    } else {
      // Create new pattern
      const touches = this.extractTouches(input, evidence);

      // Check for baseline alignment
      const alignedBaseline = this.findAlignedBaseline(touches, findingCategory);

      pattern = this.patternRepo.create({
        patternContent,
        failureMode: resolverResult.failureMode,
        findingCategory,
        severity: input.finding.severity,
        // severityMax initialized by repo to match severity
        alternative: this.generateAlternative(evidence, resolverResult.failureMode),
        carrierStage: evidence.carrierStage,
        primaryCarrierQuoteType: evidence.carrierQuoteType,
        technologies: this.extractTechnologies(input),
        taskTypes: this.extractTaskTypes(input),
        touches,
        alignedBaselineId: alignedBaseline?.id,
        status: 'active',
        permanent: false
      });
    }

    // Create occurrence (always append)
    // Compute excerpt hashes for change detection (v1.0)
    const carrierExcerptHash = createHash('sha256')
      .update(evidence.carrierQuote)
      .digest('hex');

    const originFingerprint = this.resolveOriginFingerprint(evidence);
    const originExcerptHash = evidence.citedSources.length > 0
      ? createHash('sha256')
          .update(evidence.citedSources[0]) // Hash of primary cited source
          .digest('hex')
      : undefined;

    const occurrence = this.occurrenceRepo.create({
      patternId: pattern.id,
      findingId: input.finding.id,
      issueId: input.finding.issueId,
      prNumber: input.finding.prNumber,
      severity: input.finding.severity, // Severity of THIS occurrence (v1.0)
      evidence,
      carrierFingerprint: evidence.carrierStage === 'context-pack'
        ? input.contextPack.fingerprint
        : input.spec.fingerprint,
      originFingerprint,
      provenanceChain: this.buildProvenanceChain(evidence, input),
      carrierExcerptHash,  // Full 64-char SHA-256 (v1.0)
      originExcerptHash,   // Full 64-char SHA-256 if traced (v1.0)
      wasInjected: false,
      wasAdheredTo: null,
      status: 'active'
    });

    return { pattern, occurrence };
  }

  private isBetterEvidence(
    newType: EvidenceBundle['carrierQuoteType'],
    existingType: PatternDefinition['primaryCarrierQuoteType']
  ): boolean {
    const rank = { verbatim: 3, paraphrase: 2, inferred: 1 };
    return rank[newType] > rank[existingType];
  }

  private mapScoutToCategory(scoutType: string): FindingCategory {
    const mapping: Record<string, FindingCategory> = {
      adversarial: 'security',
      security: 'security',
      bugs: 'correctness',
      tests: 'testing',
      docs: 'compliance',
      spec: 'compliance',
      decisions: 'decisions'  // v1.0: 'decisions' is its own FindingCategory
    };
    return mapping[scoutType] || 'correctness';
  }

  private extractTouches(
    input: AttributionInput,
    evidence: EvidenceBundle
  ): PatternDefinition['touches'] {
    const text = `${input.finding.description} ${input.finding.evidence} ${evidence.carrierQuote}`.toLowerCase();
    const touches: PatternDefinition['touches'] = [];

    const patterns: [RegExp, typeof touches[number]][] = [
      [/user.?input|request.?body|query.?param|form|payload/i, 'user_input'],
      [/database|sql|query|postgres|mysql|mongo/i, 'database'],
      [/network|http|api.?call|fetch|external/i, 'network'],
      [/auth|login|token|session|jwt/i, 'auth'],
      [/permission|role|access|authz|rbac/i, 'authz'],
      [/cache|redis|memcache/i, 'caching'],
      [/schema|migration|ddl|alter/i, 'schema'],
      [/log|logging|trace|audit/i, 'logging'],
      [/config|env|setting/i, 'config'],
      [/api|endpoint|route|rest|graphql/i, 'api']
    ];

    for (const [pattern, touch] of patterns) {
      if (pattern.test(text) && !touches.includes(touch)) {
        touches.push(touch);
      }
    }

    return touches.length > 0 ? touches : ['api'];
  }

  private extractTechnologies(input: AttributionInput): string[] {
    const text = `${input.finding.evidence} ${input.finding.location.file}`.toLowerCase();
    const techs: string[] = [];

    const patterns: [RegExp, string][] = [
      [/sql/i, 'sql'],
      [/postgres/i, 'postgres'],
      [/mysql/i, 'mysql'],
      [/mongo/i, 'mongodb'],
      [/redis/i, 'redis'],
      [/graphql/i, 'graphql'],
      [/rest/i, 'rest']
    ];

    for (const [pattern, tech] of patterns) {
      if (pattern.test(text) && !techs.includes(tech)) {
        techs.push(tech);
      }
    }

    return techs;
  }

  private extractTaskTypes(input: AttributionInput): string[] {
    const text = `${input.finding.description} ${input.finding.location.file}`.toLowerCase();
    const types: string[] = [];

    const patterns: [RegExp, string][] = [
      [/api|endpoint/i, 'api'],
      [/database|query/i, 'database'],
      [/migration/i, 'migration'],
      [/auth/i, 'auth']
    ];

    for (const [pattern, type] of patterns) {
      if (pattern.test(text) && !types.includes(type)) {
        types.push(type);
      }
    }

    return types;
  }

  private findAlignedBaseline(
    touches: PatternDefinition['touches'],
    category: FindingCategory
  ) {
    // Find baseline that matches touches and category
    const baselines = this.principleRepo.findActive({ origin: 'baseline' });

    for (const baseline of baselines) {
      const touchOverlap = baseline.touches.some(t =>
        touches.includes(t as typeof touches[number])
      );
      if (touchOverlap) {
        return baseline;
      }
    }

    return null;
  }

  private generateAlternative(
    evidence: EvidenceBundle,
    failureMode: string
  ): string {
    switch (failureMode) {
      case 'incorrect':
        return `Do NOT follow: "${evidence.carrierQuote.slice(0, 100)}..." Follow security best practices instead.`;
      case 'incomplete':
        return 'Ensure all edge cases and security considerations are explicitly addressed.';
      case 'missing_reference':
        return `Reference ${evidence.missingDocId || 'relevant documentation'} before proceeding.`;
      case 'ambiguous':
        return 'Clarify requirements with specific, testable acceptance criteria.';
      case 'conflict_unresolved':
        return 'Resolve conflicting guidance before implementation.';
      case 'synthesis_drift':
        return 'Verify synthesized guidance accurately reflects source documentation.';
      default:
        return 'Review and improve guidance clarity.';
    }
  }

  private inferTargetDoc(evidence: EvidenceBundle): string {
    if (evidence.missingDocId) return evidence.missingDocId;
    if (evidence.carrierStage === 'context-pack') return 'ARCHITECTURE.md';
    return 'DECISIONS.md';
  }

  private async shouldCreatePatternForDecision(
    evidence: EvidenceBundle,
    severity: string
  ): Promise<boolean> {
    // High-risk always creates pattern
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      return true;
    }
    // TODO: Check for recurrence (3+ similar)
    return false;
  }

  private resolveOriginFingerprint(
    evidence: EvidenceBundle
  ): DocFingerprint | undefined {
    if (!evidence.hasCitation || evidence.citedSources.length === 0) {
      return undefined;
    }

    const source = evidence.citedSources[0];
    if (source.endsWith('.md')) {
      return {
        kind: 'git',
        repo: 'current',
        path: source,
        commitSha: 'HEAD'
      };
    }

    return undefined;
  }

  private buildProvenanceChain(
    evidence: EvidenceBundle,
    input: AttributionInput
  ): DocFingerprint[] {
    const chain: DocFingerprint[] = [];

    chain.push(
      evidence.carrierStage === 'context-pack'
        ? input.contextPack.fingerprint
        : input.spec.fingerprint
    );

    for (const source of evidence.citedSources) {
      if (source.endsWith('.md')) {
        chain.push({
          kind: 'git',
          repo: 'current',
          path: source,
          commitSha: 'HEAD'
        });
      }
    }

    return chain;
  }

  /**
   * Suggest a fix for salience issues (when guidance exists but was not noticed).
   */
  private suggestSalienceFix(
    noncompliance: Omit<ExecutionNoncompliance, 'id' | 'createdAt'>
  ): string {
    const causes = noncompliance.possibleCauses;

    if (causes.includes('salience')) {
      return `Move guidance to a more prominent location or add explicit section header. Current location: ${noncompliance.violatedGuidanceLocation}`;
    }

    if (causes.includes('formatting')) {
      return `Improve formatting with bullet points, code blocks, or callouts to increase visibility. Consider using MUST/SHOULD keywords.`;
    }

    return 'Review guidance placement and formatting for improved discoverability.';
  }

  /**
   * Check if a ProvisionalAlert should be created for HIGH/CRITICAL security findings
   * with inferred carrierQuoteType that don't meet the pattern gate.
   *
   * ProvisionalAlerts (v1.0 schema):
   * - Short-lived alerts for CRITICAL findings that don't meet pattern gate (2+ occurrences)
   * - TTL of 14 days by default
   * - If same issue recurs within TTL, promote to full PatternDefinition
   */
  private checkAndCreateProvisionalAlert(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ReturnType<typeof resolveFailureMode>
  ): ProvisionalAlert | undefined {
    // Only create ProvisionalAlert for:
    // 1. HIGH or CRITICAL severity
    // 2. Security-related findings
    // 3. Inferred carrierQuoteType (couldn't find direct guidance)
    const isHighSeverity = input.finding.severity === 'HIGH' ||
                          input.finding.severity === 'CRITICAL';
    const isSecurityRelated = input.finding.scoutType === 'security' ||
                              input.finding.scoutType === 'adversarial';
    const isInferred = evidence.carrierQuoteType === 'inferred';

    if (!isHighSeverity || !isSecurityRelated || !isInferred) {
      return undefined;
    }

    // Extract touches from the context
    const touches = this.extractTouches(input, evidence);

    // Create ProvisionalAlert with v1.0 schema
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days TTL

    return this.provisionalAlertRepo.create({
      findingId: input.finding.id,
      issueId: input.finding.issueId,
      message: this.generateAlertMessage(input, evidence, resolverResult),
      touches,
      injectInto: evidence.carrierStage, // Inject into same stage where issue was found
      expiresAt: expiresAt.toISOString(),
      status: 'active'
    });
  }

  /**
   * Generate a short actionable warning message for ProvisionalAlert (v1.0).
   */
  private generateAlertMessage(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ReturnType<typeof resolveFailureMode>
  ): string {
    const category = input.finding.scoutType;
    const mode = resolverResult.failureMode;

    if (mode === 'incomplete') {
      return `[${input.finding.severity}] Missing security constraint: ${input.finding.title.slice(0, 100)}`;
    }
    if (mode === 'missing_reference') {
      return `[${input.finding.severity}] Security doc not referenced: ${evidence.missingDocId || 'unknown'}`;
    }
    return `[${input.finding.severity}] ${category} issue: ${input.finding.title.slice(0, 100)}`;
  }

  /**
   * Suggest an action for provisional alerts.
   */
  private suggestProvisionalAction(
    evidence: EvidenceBundle,
    resolverResult: ReturnType<typeof resolveFailureMode>
  ): string {
    if (evidence.mandatoryDocMissing) {
      return `Add ${evidence.missingDocId || 'relevant security documentation'} to context pack`;
    }

    if (resolverResult.failureMode === 'incomplete') {
      return 'Add explicit security guidance for this scenario to prevent future occurrences';
    }

    return 'Review finding and determine if documentation updates are needed';
  }
}
```

---

## 8. Dependencies

Add to package.json:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0"
  }
}
```

---

## 9. Acceptance Criteria

Phase 2 is complete when:

1. [ ] Attribution Agent extracts valid EvidenceBundle
2. [ ] FailureMode resolver passes all decision tree branches
3. [ ] ExecutionNoncompliance detected when guidance exists
4. [ ] Decisions findings create DocUpdateRequest
5. [ ] Pattern deduplication works via patternKey
6. [ ] Baseline alignment detected for inferred patterns
7. [ ] All tests pass

---

## 10. Handoff to Phase 4

After Phase 2, the following are available:

- `AttributionOrchestrator` - Full attribution flow
- `runAttributionAgent()` - Extracts EvidenceBundle
- `resolveFailureMode()` - Deterministic failureMode
- `checkForNoncompliance()` - ExecutionNoncompliance detection

Phase 4 (Integration) will wire the orchestrator into the PR Review workflow.
