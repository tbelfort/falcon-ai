# Research: Phase 2 Attribution Engine Patterns

This document provides research findings and implementation patterns for Phase 2 (Attribution Engine) of the falcon-ai project.

---

## 1. Decision Tree Implementation Patterns

**Sources:**
- [decision-tree npm package](https://www.npmjs.com/package/decision-tree)
- [@am/decisiontree on JSR](https://jsr.io/@am/decisiontree)
- [Binary Decision Tree in JavaScript](https://dev.to/dstrekelj/how-to-create-a-binary-decision-tree-in-javascript-330g)

### Deterministic vs ML-Based Decision Trees

For the Attribution Engine, we use **deterministic decision trees** rather than ML-based ones:

| Aspect | ML Decision Tree | Deterministic Decision Tree |
|--------|------------------|----------------------------|
| Training | Requires labeled data | No training required |
| Consistency | May vary with retraining | Same input = same output |
| Debuggability | Black box | Fully traceable |
| Reversibility | Requires retrain | Just update rules |

### TypeScript Implementation Pattern

The Phase 2 `failure-mode-resolver.ts` follows this pattern:

```typescript
interface ResolverResult {
  failureMode: FailureMode;
  confidenceModifier: number;
  flags: Record<string, boolean>;
  reasoning: string;  // Critical for debuggability
}

function resolveFailureMode(evidence: EvidenceBundle): ResolverResult {
  // Step A: Early exit conditions (highest priority)
  if (condition1) return { failureMode: 'X', reasoning: 'why X' };

  // Step B: Next priority
  if (condition2) return { failureMode: 'Y', reasoning: 'why Y' };

  // Step C: Scoring-based decision
  const scoreA = calculateScoreA(evidence);
  const scoreB = calculateScoreB(evidence);

  if (scoreA > scoreB && scoreA >= threshold) {
    return { failureMode: 'A', reasoning: `A wins: ${scoreA} vs ${scoreB}` };
  }

  // Step D: Default fallback
  return { failureMode: 'default', reasoning: 'No conditions matched' };
}
```

### Best Practices

1. **Early exit for definitive conditions:** Check clear-cut cases first (e.g., source disagrees = synthesis_drift)
2. **Document reasoning at every branch:** Return human-readable explanation
3. **Use scoring for ambiguous cases:** When multiple failure modes are plausible
4. **Deterministic tie-breaks:** Use alphabetical ordering or other consistent method
5. **No LLM in the loop:** Decision tree operates on structured features only

### Testing Strategy

```typescript
describe('resolveFailureMode', () => {
  // Test each branch independently
  describe('Step A: Synthesis Drift', () => {
    it('returns synthesis_drift when source disagrees', () => { ... });
    it('returns incorrect with penalty when source unretrievable', () => { ... });
  });

  // Test branch priority (earlier branches take precedence)
  describe('Branch Priority', () => {
    it('Step A takes precedence over Step B', () => { ... });
  });

  // Test scoring tie-breaks
  describe('Scoring Tie-Breaks', () => {
    it('uses deterministic ordering when scores equal', () => { ... });
  });
});
```

---

## 2. Content Hashing with SHA-256

**Sources:**
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [SHA-256 in NodeJS](https://mojoauth.com/hashing/sha-256-in-nodejs/)
- [Using SHA-256 with NodeJS Crypto](https://www.codegenes.net/blog/using-sha-256-with-nodejs-crypto/)

### Basic Implementation

```typescript
import { createHash } from 'crypto';

/**
 * Generate a content-addressable hash for pattern deduplication.
 * Same content always produces same hash.
 */
function contentHash(content: string): string {
  return createHash('sha256')
    .update(content)
    .digest('hex');
}
```

### Best Practices for Attribution Engine

1. **Normalize before hashing:** Consistent whitespace handling
   ```typescript
   const normalizedContent = content.replace(/\s+/g, ' ').trim();
   const hash = contentHash(normalizedContent);
   ```

2. **Composite keys for pattern deduplication:**
   ```typescript
   // patternKey = SHA-256(carrierStage|patternContent|findingCategory)
   const patternKey = createHash('sha256')
     .update(`${carrierStage}|${normalizedContent}|${findingCategory}`)
     .digest('hex');
   ```

3. **Full hash storage:** Store full 64-character hex string (not truncated)
   - Truncating increases collision risk
   - Storage cost is minimal (~64 bytes vs ~8 bytes)

4. **Timing-safe comparison for sensitive contexts:**
   ```typescript
   import { timingSafeEqual } from 'crypto';

   function compareHashes(a: string, b: string): boolean {
     const bufA = Buffer.from(a, 'hex');
     const bufB = Buffer.from(b, 'hex');
     return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
   }
   ```

### Hash Usage in Phase 2

| Field | Purpose | Computation |
|-------|---------|-------------|
| `patternKey` | Pattern deduplication | SHA-256(carrierStage\|content\|category) |
| `carrierExcerptHash` | Change detection | SHA-256(carrierQuote) |
| `originExcerptHash` | Source tracking | SHA-256(citedSource) |
| `guidanceLocationHash` | SalienceIssue grouping | SHA-256(stage\|location\|excerpt) |

---

## 3. Confidence Scoring Algorithms

**Sources:**
- [Confidence Scores in Machine Learning](https://www.mindee.com/blog/how-use-confidence-scores-ml-models)
- [Confidence Score Overview](https://www.sciencedirect.com/topics/computer-science/confidence-score)
- [Confidence-weighted Integration](https://www.sciencedirect.com/science/article/pii/S2666389925002715)

### Bayesian vs Weighted Scoring

| Approach | Pros | Cons | Use Case |
|----------|------|------|----------|
| **Bayesian** | Incorporates priors, updates with data | Complex, requires probability distributions | ML models with training data |
| **Weighted Scoring** | Simple, deterministic, explainable | Weights are manually tuned | Rule-based systems |
| **Hybrid** | Best of both, calibrated over time | Requires feedback loop | Production systems with learning |

### Phase 2 Approach: Weighted Scoring

The Attribution Engine uses weighted scoring for simplicity and debuggability:

```typescript
/**
 * Evidence quality base scores by carrierQuoteType
 */
const EVIDENCE_QUALITY_BASE: Record<CarrierQuoteType, number> = {
  verbatim: 0.75,    // Exact text found
  paraphrase: 0.55,  // Similar meaning found
  inferred: 0.35     // No direct guidance found
};

/**
 * Calculate attribution confidence.
 * Uses weighted scoring with explicit components for debuggability.
 */
function calculateConfidence(params: {
  quoteType: CarrierQuoteType;
  occurrenceCount: number;
  daysSinceLastOccurrence: number;
  confidenceModifier: number;  // From resolver
}): number {
  // Base from evidence quality
  let confidence = EVIDENCE_QUALITY_BASE[params.quoteType];

  // Occurrence boost (diminishing returns)
  const occurrenceBoost = Math.min(0.15, params.occurrenceCount * 0.05);
  confidence += occurrenceBoost;

  // Decay penalty
  const decayPenalty = Math.min(0.15, params.daysSinceLastOccurrence * 0.001);
  confidence -= decayPenalty;

  // Apply modifier from resolver
  confidence += params.confidenceModifier;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}
```

### Threshold Calibration

```typescript
// Default thresholds (calibrate based on observed data)
const THRESHOLDS = {
  HIGH_CONFIDENCE: 0.70,   // Inject with full priority
  MEDIUM_CONFIDENCE: 0.50, // Inject with reduced priority
  LOW_CONFIDENCE: 0.35,    // Log only, don't inject
};
```

### Future Enhancement: Bayesian Calibration

Track `wasAdheredTo` outcomes to calibrate confidence:

```typescript
interface ConfidenceCalibration {
  quoteType: CarrierQuoteType;
  totalInjections: number;
  adherenceCount: number;
  calibratedConfidence: number;  // adherenceCount / totalInjections
}
```

---

## 4. Enum-Based Classification Patterns

**Sources:**
- [TypeScript Discriminated Unions](https://basarat.gitbook.io/typescript/type-system/discriminated-unions)
- [TypeScript Enums: The Good, Bad, and Ugly](https://www.crocoder.dev/blog/typescript-enums-good-bad-and-ugly/)
- [Discriminated Unions and Destructuring](https://kyleshevlin.com/discriminated-unions-and-destructuring-in-typescript/)
- [TypeScript Enum Patterns 2025](https://2ality.com/2025/01/typescript-enum-patterns.html)

### String Literal Unions vs Enums

For FailureMode and other classification types, prefer **string literal unions**:

```typescript
// Preferred: String literal union (better inference, no runtime overhead)
type FailureMode =
  | 'incorrect'
  | 'incomplete'
  | 'missing_reference'
  | 'ambiguous'
  | 'conflict_unresolved'
  | 'synthesis_drift';

// Alternative: Enum (use when runtime iteration needed)
enum FailureModeEnum {
  Incorrect = 'incorrect',
  Incomplete = 'incomplete',
  MissingReference = 'missing_reference',
  Ambiguous = 'ambiguous',
  ConflictUnresolved = 'conflict_unresolved',
  SynthesisDrift = 'synthesis_drift'
}
```

### Exhaustiveness Checking

Use the `never` type to ensure all cases are handled:

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

function handleFailureMode(mode: FailureMode): string {
  switch (mode) {
    case 'incorrect':
      return 'The guidance was wrong';
    case 'incomplete':
      return 'The guidance was missing details';
    case 'missing_reference':
      return 'Required doc not referenced';
    case 'ambiguous':
      return 'The guidance was unclear';
    case 'conflict_unresolved':
      return 'Conflicting guidance found';
    case 'synthesis_drift':
      return 'Carrier distorted source';
    default:
      return assertNever(mode);  // Compile error if case missing
  }
}
```

### Discriminated Unions for Complex Types

```typescript
// Evidence result varies by quote type
type EvidenceResult =
  | { quoteType: 'verbatim'; exactMatch: string; location: string }
  | { quoteType: 'paraphrase'; similarText: string; similarity: number }
  | { quoteType: 'inferred'; missingGuidanceDescription: string };

function processEvidence(result: EvidenceResult) {
  switch (result.quoteType) {
    case 'verbatim':
      // TypeScript knows result.exactMatch exists
      console.log(`Found exact: ${result.exactMatch}`);
      break;
    case 'paraphrase':
      // TypeScript knows result.similarity exists
      console.log(`Found similar (${result.similarity}%): ${result.similarText}`);
      break;
    case 'inferred':
      console.log(`Missing: ${result.missingGuidanceDescription}`);
      break;
  }
}
```

### Best Practices for Phase 2

1. **Use string literal unions** for FailureMode, Severity, Status
2. **Use discriminated unions** for DocFingerprint, EvidenceResult
3. **Implement exhaustiveness checks** in all switch statements
4. **Use Zod for runtime validation** of union types:
   ```typescript
   const FailureModeSchema = z.enum([
     'incorrect', 'incomplete', 'missing_reference',
     'ambiguous', 'conflict_unresolved', 'synthesis_drift'
   ]);
   type FailureMode = z.infer<typeof FailureModeSchema>;
   ```

---

## 5. Evidence Extraction Patterns

### Structured Output from LLM

The Attribution Agent outputs structured JSON that the resolver processes:

```typescript
interface EvidenceBundle {
  // Location
  carrierStage: 'context-pack' | 'spec';
  carrierLocation: string;

  // Quote
  carrierQuote: string;
  carrierQuoteType: 'verbatim' | 'paraphrase' | 'inferred';
  carrierInstructionKind: 'explicitly_harmful' | 'benign_but_missing_guardrails' | 'descriptive' | 'unknown';

  // Provenance
  hasCitation: boolean;
  citedSources: string[];
  sourceRetrievable: boolean;
  sourceAgreesWithCarrier: boolean | null;

  // Quality signals
  mandatoryDocMissing: boolean;
  missingDocId: string | null;
  vaguenessSignals: string[];
  hasTestableAcceptanceCriteria: boolean;
  conflictSignals: ConflictSignal[];
}
```

### Keyword Extraction for Noncompliance Check

```typescript
function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();

  // Remove common stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', /* ... */
  ]);

  // Extract meaningful words
  return text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .filter((v, i, a) => a.indexOf(v) === i);  // Dedupe
}
```

### Sliding Window Search

For finding guidance in documents:

```typescript
function searchDocument(doc: string, keywords: string[]): DocumentMatch | null {
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
```

---

## 6. Technology Stack Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| Decision Tree | Custom TypeScript | Deterministic failureMode resolution |
| Hashing | Node.js crypto (SHA-256) | Pattern deduplication, change detection |
| Confidence | Weighted scoring | Attribution confidence calculation |
| Classification | String literal unions + Zod | Type-safe FailureMode handling |
| LLM Integration | Anthropic SDK | Evidence extraction |
| Storage | better-sqlite3 | Pattern and occurrence persistence |

---

## References

- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [TypeScript Discriminated Unions](https://basarat.gitbook.io/typescript/type-system/discriminated-unions)
- [Confidence Scores in ML](https://www.mindee.com/blog/how-use-confidence-scores-ml-models)
- [Zod Schema Validation](https://zod.dev/)
- [decision-tree npm](https://www.npmjs.com/package/decision-tree)
- [@am/decisiontree JSR](https://jsr.io/@am/decisiontree)
