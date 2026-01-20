# GPT-5 Pro Review Request: Pattern Attribution Spec v0.9

## Context

We've incorporated your previous recommendations into a comprehensive spec (attached separately). This document contains:

1. Summary of what we adopted from your recommendations
2. Specific questions where we need refinement
3. Areas where we made judgment calls you should validate

---

## What We Adopted From Your Recommendations

### 1. Evidence Features + Deterministic Resolver (Fully Adopted)

We implemented your core insight: Attribution Agent outputs structured evidence, then a decision tree resolves failureMode.

```typescript
interface EvidenceBundle {
  carrierStage: 'context-pack' | 'spec';
  carrierQuote: string;
  carrierQuoteType: 'verbatim' | 'paraphrase' | 'inferred';
  hasCitation: boolean;
  sourceRetrievable: boolean;
  sourceAgreesWithCarrier: boolean | null;
  mandatoryDocMissing: boolean;
  vaguenessSignals: string[];
  conflictSignals: ConflictSignal[];
  // ... etc
}
```

Decision tree in spec Section 3.3.

### 2. ExecutionNoncompliance as Separate Entity (Fully Adopted)

Critical distinction we were missing. Now we have:
- **Pattern** = guidance was wrong
- **ExecutionNoncompliance** = guidance was right, agent ignored it

Spec Section 2.4.

### 3. Pattern vs Occurrence Separation (Fully Adopted)

You convinced us. PatternOccurrence is append-only with:
- Per-occurrence fingerprints
- Evidence quality per occurrence
- Injection/adherence tracking
- Clean invalidation via `status: 'inactive'`

Spec Section 2.2.

### 4. `touches` for Filtering (Fully Adopted)

Using `touches` (user_input, database, network, etc.) instead of strict technology tags. More robust.

Spec Section 2.1 (Touch enum).

### 5. Separated Confidence from Priority (Fully Adopted)

- `attributionConfidence` = belief (how sure the attribution is correct)
- `injectionPriority` = action (how urgently to inject)

Spec Section 4.

### 6. Tiered Injection with Security Priority (Fully Adopted)

- 2 baseline principles
- Up to 3 security patterns
- Fill remaining with highest-priority non-security
- Cap at 6 total

Spec Section 5.1.

### 7. DocFingerprint Union Type (Fully Adopted)

```typescript
type DocFingerprint =
  | { kind: 'git'; repo: string; path: string; commitSha: string }
  | { kind: 'linear'; docId: string; updatedAt: string; contentHash: string }
  | { kind: 'web'; url: string; retrievedAt: string; excerptHash: string }
  | { kind: 'external'; id: string; version?: string };
```

Spec Section 2.2.

### 8. Decisions → DocUpdateRequests (Adopted with Nuance)

Decisions findings always create DocUpdateRequest. Only create Pattern if recurring (3+) or high-risk.

Spec Section 3.5.

### 9. v1 Scope (Adopted)

Deferred: semantic clustering, conflict graphs, confidence calibration, derived principles from clusters.

Spec Section 10.

---

## Questions Requiring Your Input

### Q1: Attribution Agent Implementation Strategy

The evidence bundle requires substantial work. Should we:

**A) Run Attribution Agent once per confirmed finding**
- Simpler prompt
- More latency (6+ runs per PR)
- Each run is focused

**B) Batch all findings per PR into one Attribution Agent run**
- Single run, complex prompt
- Risk of cross-contamination between findings
- More efficient

**C) Pre-compute some features at Context Pack creation**
- Have Context Pack agent output `vaguenessFlags` and `conflictsDetected`
- Attribution Agent only does carrier matching and provenance tracing
- Most efficient, but splits responsibility

We lean toward **C**. The Context Pack agent already reads all the docs, so it can detect vagueness and conflicts. Attribution Agent then focuses on matching findings to carriers and tracing provenance.

Is this the right split? Or does separating concerns create coordination problems?

---

### Q2: taskProfile Extraction Method

The injection system depends on accurate taskProfile. Options:

**A) Explicit prompt in Context Pack template**
```
"Identify what this task touches from: user_input, database, network, auth, authz, caching, schema, logging, config, api"
```
- Clear, deterministic
- May miss implicit touches

**B) Inferred from constraints extracted**
- If constraints mention "SQL queries" → add database
- Requires inference rules
- Could be more accurate

**C) Both with validation**
- Explicit prompt + inference
- Cross-check for consistency
- Most robust, more complex

We lean toward **A** for v1 simplicity. The explicit list is clear and the Context Pack agent has enough context to classify accurately.

Do you agree, or is inference important enough to include in v1?

---

### Q3: Baseline Principles Completeness

Our 10 baselines (Spec Section 6.1):

1. Parameterize SQL queries
2. Validate external input
3. Never log secrets/PII
4. Explicit authorization checks
5. Timeouts on network calls
6. Retry with backoff
7. Idempotency keys
8. Size/rate limits
9. Migration/rollback plan for schema
10. Define error contract

**Questions:**
- Missing anything critical?
- Too many? (Warning fatigue even at baseline level?)
- Should we add async/concurrency baselines? (e.g., "Never block event loop with sync calls")
- Should "use secure defaults" be a baseline, or is it too vague to be actionable?

---

### Q4: relevanceWeight Formula Shape

Current formula:
```
relevanceWeight = min(1.0 + 0.1 * touchOverlaps + 0.1 * techOverlaps, 1.5)
```

This is:
- Linear growth with overlap count
- Capped at 1.5

Alternatives considered:
- **Binary**: any overlap = 1.2, none = 1.0 (simpler)
- **Uncapped**: more overlaps = higher weight forever (could cause runaway)

Is our capped linear approach reasonable? Or should we simplify to binary for v1?

---

### Q5: ExecutionNoncompliance Follow-up Actions

When we record ExecutionNoncompliance, what should happen?

**A) Just record for analysis (v1)**
- No immediate action
- Accumulate data for v2 improvements

**B) Trigger warning format review**
- If same guidance is repeatedly ignored, maybe formatting is the problem
- Automatic salience improvement

**C) Increase future injection prominence**
- Guidance that's ignored gets more prominent injection next time
- Risk: infinite escalation?

We lean toward **A** for v1. ExecutionNoncompliance is valuable data, but acting on it automatically feels premature without understanding patterns first.

Agree? Or is **B** safe enough for v1?

---

### Q6: Conflict Precedence Order

You suggested: security > privacy > backcompat > correctness > performance > style

We adopted this but question whether all levels are needed for v1. In practice:
- security vs correctness: common
- correctness vs performance: common
- privacy and backcompat: rare in our codebase?

Should we simplify to: security > correctness > everything else?

---

### Q7: Inferred Pattern Gate

For `primaryCarrierQuoteType == 'inferred'`, we require:
- 2+ occurrences, OR
- HIGH/CRITICAL severity AND `alignedBaselineId` is set (pattern aligns with a baseline), OR
- `failureMode == 'missing_reference'`

We added `alignedBaselineId` to PatternDefinition to track baseline alignment explicitly.

Is this gate too restrictive or too loose?

Specifically: if an inferred pattern has only 1 occurrence but severity is CRITICAL and it's a **novel** security issue (doesn't align with existing baselines), should we inject anyway? Or is the 2+ occurrence requirement sufficient protection against false positives?

---

### Q8: Spec Structural Review

Does the spec (attached) have any:
- Structural issues?
- Missing entities or fields?
- Incorrect flows?
- Internal contradictions?

Please flag anything that looks wrong or incomplete.

---

## Judgment Calls We Made (For Your Validation)

### J1: Occurrence Append-Only, Pattern Mutable

- PatternOccurrence is append-only with limited post-creation updates:
  - `status` can change from 'active' to 'inactive'
  - `inactiveReason` is set when status becomes inactive
  - `wasAdheredTo` is set after PR review (from null to true/false)
  - No other fields are ever modified
- PatternDefinition can be updated (status, supersededBy, primaryCarrierQuoteType if better evidence found)

This asymmetry feels right but wanted to confirm.

### J2: 6-Item Injection Cap

We chose 6 (2 baseline + 4 learned) based on:
- Token budget concerns
- Warning fatigue research (more than 5-7 items = ignored)
- Security priority (up to 3 of the 4 learned can be security)

Is 6 the right number? Should it be configurable per-task based on complexity?

### J3: 90-Day Decay Half-Life

Patterns decay over 90 days (max 0.15 penalty). This was somewhat arbitrary.

Should decay be:
- Faster (30-60 days) to stay fresh?
- Slower (180 days) to preserve hard-won learning?
- Category-dependent (security decays slower)?

### J4: Decisions Findings Threshold (3+)

We only create Pattern from decisions findings if the same decision class recurs 3+ times.

Is 3 the right threshold? Too conservative (misses real patterns)? Too aggressive (creates noise)?

---

## Summary

The spec is comprehensive and we believe implementable. We want your review on:

1. **Q1-Q7**: Specific design questions
2. **Q8**: Structural review of the full spec
3. **J1-J4**: Validation of our judgment calls

Please flag anything that seems wrong, premature, or missing. We'd rather course-correct now than during implementation.
