# Guardrail System: Future Enhancements

This document captures planned enhancements to the pattern-based guardrail system.

---

## Tiered Injection Model

### The Insight

Different workflow phases have different context capacities and roles. Builders need focus; reviewers need coverage.

### Current Model

Flat injection: 6 patterns per phase (2 baseline + 4 learned).

### Proposed Model

Tiered injection based on phase role:

| Phase | Role | Context Available | Injection Capacity |
|-------|------|-------------------|-------------------|
| Context Pack Creation | Building | Task description only | Low (6) |
| Spec Creation | Building | Context Pack | Low (6) |
| **Context Pack Review** | Finding problems | Full Context Pack + task | **Adaptive (11-18)** |
| **Spec Review** | Finding problems | Full Spec + ai_docs + Context Pack | **Adaptive (11-18)** |
| Implementation | Building | Spec | Low (6) |
| PR Review | Finding problems | Full code diff + spec | High (12 agents with full pattern access) |

### Rationale

**Builders need focus.**
- Too many warnings = paralysis
- They need the most critical patterns for *this specific task*
- Signal-to-noise ratio matters when generating content

**Reviewers need coverage.**
- They're in "find problems" mode
- More patterns = more things to check against
- They're not building, they're verifying

**But: Warning fatigue is real.**

> "The CPU is idle but the human attention cache isn't"

Review agents may have spare tokens, but can still get **warning fatigue** — they start pattern-matching instead of thinking. Don't inject 18 patterns blindly; make it **smart, not big**.

### Smart Injection Rules

#### A. Confidence-Based Baseline Scaling

Scale baseline injection inversely to taskProfile confidence:

| taskProfile.confidence | Baseline Budget | Rationale |
|------------------------|-----------------|-----------|
| **≥ 0.7** (high) | 2-3 (by touch overlap) | We know what this is — be precise |
| **0.5-0.7** (medium) | 4 | Moderate uncertainty |
| **< 0.5** (low) | Up to 6 | Classification is shaky — broad coverage |

```
HIGH confidence (≥0.7)          LOW confidence (<0.5)
─────────────────────           ─────────────────────
"We know what this is"          "We're not sure what this is"
        ↓                               ↓
2-3 targeted baselines          Up to 6 baselines
(best touch overlap)            (broad coverage)
        ↓                               ↓
Precision over recall           Recall over precision
```

#### B. Stricter Relevance Gates as Budget Grows

If you triple the count without tightening relevance, you inject noise:

```typescript
// For reviewers with higher budgets:
// Require touchOverlap >= 2 for learned patterns
// UNLESS severity is HIGH/CRITICAL
crossProjectPatterns = crossProjectPatterns.filter(p =>
  countOverlap(p.touches, taskProfile.touches) >= 2
  || p.severityMax in ['HIGH', 'CRITICAL']
)

// Prefer HIGH/CRITICAL + recent patterns first
// Deprioritize LOW/MEDIUM unless extremely on-touch
```

#### C. Compressed Formatting for Review Mode

Creators need the story. Reviewers need a spot-check list.

**Creator format (explanatory):**
```
### [SECURITY][incomplete][HIGH] SQL injection
**Bad guidance:** "Use template literals for SQL for readability."
**Observed result:** SQL injection vulnerability (PROJ-123, PR #456).
**Do instead:** Always use parameterized queries. Never interpolate user input.
**Applies when:** touches=database,user_input; tech=sql,postgres
```

**Reviewer format (compact):**
```
🚩 SQL injection (PROJ-123) → parameterized queries only [HIGH]
🚩 Retry backoff (PROJ-456) → exponential + jitter [MEDIUM]
🚩 Connection lifecycle (PROJ-789) → explicit cleanup [HIGH]
```

Same information, ~1/4 the tokens. Allows 18 patterns without prompt novella.

### Injection Distribution (Updated)

```
Creation Phases (6 patterns each):
  Context Pack ──[6]──► Spec ──[6]──► Implementation ──[6]──►

Review Phases (adaptive):
  Context Pack Review ◄──[11-18]──┐  (confidence-scaled)
                                  │
  Spec Review ◄────────[11-18]────┤  (confidence-scaled)
                                  │
  PR Review ◄──────────[12 agents with full pattern access]
```

**Default suggestion for review agents:**
- **12 total** (3 baseline + 1 derived + 8 learned)
- **Burst to 18** only when:
  - `taskProfile.confidence` is low, OR
  - Touched surface area is big (auth + database + network), OR
  - Project has high density of recent HIGH/CRITICAL patterns

### LLM Selection Prompts

The selection prompt changes per phase type:

**For Creation Phases:**
> "Select the 6 most critical patterns for this task. Prioritize patterns that would cause the agent to build something wrong."

**For Review Phases:**
> "Select up to N patterns relevant to this Context Pack/Spec (N based on confidence level). Include patterns that:
> - Directly apply to the technologies used
> - Have caused issues in similar tasks
> - The creator might have missed
> Prioritize HIGH/CRITICAL severity and recent patterns."

### Expected Impact

- **Creation phases:** Unchanged — focused, actionable warnings
- **Review phases:** Adaptive coverage — more patterns when uncertain, fewer when confident
- **Warning fatigue:** Mitigated by confidence scaling and compact formatting
- **Overall:** More issues caught at review time without drowning reviewers in lore

---

## Context-Aware Injection (Current Design)

For reference, the current injection model is already context-aware:

### How It Works

```
Task: Implement async HTTP client with retry logic
         │
         ▼
    Pattern Store
    (hundreds of patterns)
         │
         ▼
    LLM Selection
    "Which patterns are relevant to THIS task?"
         │
         ▼
    Injected Warnings (with provenance):
    - "httpx connection pooling caused issues in CON-234 — see mitigation"
    - "Retry backoff without jitter led to thundering herd in CON-567"
    - "Async timeout handling was wrong in 4 PRs — use pattern from ai_docs/httpx-async.md"
```

### Why LLM Selection (Not Generic Top-N)

| Approach | Problem |
|----------|---------|
| Generic top-N warnings | Noise — most aren't relevant to this task |
| Keyword matching | Too crude — misses semantic relevance |
| **LLM-selected per task** | Signal — warnings that actually apply |

The agent working on a database migration doesn't need warnings about HTTP retry patterns. The agent working on auth doesn't need warnings about file path handling (unless it does — and the LLM knows the difference).

### Provenance Matters

"This caused issues in CON-123" is more convincing than "best practice says don't do this."

Each injected warning includes:
- The pattern description
- Link to source occurrence(s)
- The failure mode it caused
- Suggested mitigation

---

## Future Considerations

### Pattern Clustering

As the pattern store grows, related patterns may emerge. Consider:
- Automatic clustering of similar patterns
- Derived principles from pattern clusters
- Hierarchy: Principle → Patterns → Occurrences

### Injection Priority Tuning

Current: Security patterns get priority.

Future considerations:
- Recency weighting (recent failures more relevant?)
- Frequency weighting (common failures more important?)
- Severity weighting (CRITICAL > HIGH > MEDIUM)
- Task-type weighting (some patterns only apply to certain component types)

### Feedback on Injection Effectiveness

Track whether injected patterns actually prevented issues:
- Did the agent mention the warning in their work?
- Did the review find the warned-about issue anyway?
- Did the pattern prove irrelevant to this task?

This creates a feedback loop on the injection selection itself.

---

## Proactive Principles Compliance

### The Insight

The current system is **reactive** — we only catch principle violations when they cause PR review findings. A **proactive** system would scan code against ALL known principles before issues surface.

### Current Model (Reactive)

```
PR Created → Scouts find ad-hoc issues → Judge confirms → Attribution links to patterns
```

Problems with reactive-only:
- Violations must cause visible issues to be caught
- Known principles aren't systematically checked
- Same mistakes can repeat until they happen to trigger a finding

### Proposed Model (Proactive + Reactive)

```
REACTIVE (existing):
PR Created → Issue Scouts → Judge → Attribution

PROACTIVE (new):
Code written → Principles Scout scans against ALL principles → Judge confirms → Issue flagged before PR merge
```

### Expanded Baseline Principles

B01-B11 are a starting set. Expand with curated additions:

| Category | Example Principles | Rationale |
|----------|-------------------|-----------|
| **Security** | Input sanitization, secrets handling, auth token lifecycle | OWASP fundamentals |
| **Async** | Cancellation propagation, timeout requirements, deadlock prevention | Common async pitfalls |
| **Data** | Schema migration safety, backup before destructive ops | Data integrity |
| **API** | Versioning requirements, deprecation patterns | API stability |
| **Testing** | Minimum coverage gates, test isolation rules | Quality gates |

**Constraint:** Injection budget caps at 2 baseline warnings. Baselines should be:
- Universal (apply to nearly all code)
- High-impact (violations cause real problems)
- Actionable (agent can actually check/fix)

### Two Entities: Principles and Patterns

The guardrail system has two distinct entity types:

| Entity | Origin | Purpose | Action |
|--------|--------|---------|--------|
| **Principles** | Baseline (B01-B11) or Derived (promoted from patterns) | Rules/constraints code must follow | **Check compliance** |
| **Patterns** | Learned from PR findings | Contextual reasoning helpers for agents | **Inject as context** |

**Principles are rules.** They're checkable constraints:
- "All inputs MUST be validated at system boundaries" → Check: did you violate this?
- "Frozen Pydantic models MUST use immutable collection types" → Check: any `list` in a frozen model?

**Patterns are context.** They're injected to help agents reason:
- "httpx connection pooling caused issues in CON-234 — see mitigation"
- "Retry backoff without jitter led to thundering herd in CON-567"

You don't "check" if code violates a pattern — you inject the pattern so the agent knows to avoid the mistake.

```
PRINCIPLES (check)              PATTERNS (inject)
────────────────────            ────────────────────
Baseline or Derived       vs    Learned from failures
Compliance auditing             Reasoning context
"You violated B03"              "Watch out for this..."
Principles Scout checks         Injected into prompts
```

### Baseline vs Derived Principles (v1 Spec)

**Important distinction:** In v1, derived ≠ baseline.

| Aspect | Baseline (B01-B11) | Derived |
|--------|-------------------|---------|
| **Origin** | Manually curated | Auto-promoted from patterns (3+ projects) |
| **Scope** | Workspace | Workspace |
| **Permanence** | Sacred, never archived | Can be archived/rolled back if noisy |
| **Addition** | Requires explicit spec change | Automatic via promotion gate |
| **Field** | `origin: 'baseline'` | `origin: 'derived'`, `derivedFrom: PatternDefinition[]` |

**If you want derived → baseline:** Add a manual "bless" workflow (human-reviewed). Keeps baselines sacred and prevents the system from slowly turning into a haunted museum of once-useful rules.

### TaskProfile: How Relevance Selection Works

TaskProfile classifies what a task interacts with, enabling **relevant** injection:

```typescript
interface TaskProfile {
  touches: Touch[];        // System areas: user_input, database, network, auth, authz, caching, file_system
  technologies: string[];  // Specific tech: sql, postgres, redis, httpx, jwt
  taskTypes: string[];     // Task kind: api, database, ui, migration, security
  confidence: number;      // Classification confidence (0-1)
}
```

**Example:**
```yaml
Task: "Implement user authentication endpoint"

TaskProfile:
  touches: [auth, database, user_input, api]
  technologies: [postgres, jwt, bcrypt]
  taskTypes: [api, security]
  confidence: 0.85
```

**Relevance formula (from spec):**
```
touchOverlaps = count of (pattern.touches ∩ taskProfile.touches)
techOverlaps = count of (pattern.technologies ∩ taskProfile.technologies)
relevanceWeight = min(1.0 + 0.15 * touchOverlaps + 0.05 * techOverlaps, 1.5)
```

Touches weighted higher (0.15) than technologies (0.05) because touches are more robust abstractions.

### Two-Layer Scout Architecture

The system has two complementary layers for scout injection:

```
LAYER A: Existing Scouts (amplified with patterns + principles)
──────────────────────────────────────────────────────────────
Security Scout
  ├── PATTERNS (learned): "SQL concat caused issues in CON-234"
  └── PRINCIPLES (rules): B02, B03, B07, B11

Docs Scout
  ├── PATTERNS (learned): "Missing ai_doc caused issues in CON-456"
  └── PRINCIPLES (rules): Doc-related principles

Decisions Scout
  ├── PATTERNS (learned): "Undocumented timeout default caused issues"
  └── PRINCIPLES (rules): Decision-related principles


LAYER B: Principle Compliance Scouts (systematic, principles only)
──────────────────────────────────────────────────────────────────
Database Principles Scout
  └── ONLY PRINCIPLES: B01, B02, B08, B11 + derived DB principles

Network Principles Scout
  └── ONLY PRINCIPLES: B05, B06, B07 + derived network principles

Auth Principles Scout
  └── ONLY PRINCIPLES: B04 + derived auth principles
```

**Why two layers?**

| Layer | Purpose | Contains | Catches |
|-------|---------|----------|---------|
| **A: Existing Scouts** | Amplify domain expertise | Patterns + Principles | Issues within their domain they'd otherwise miss |
| **B: Principle Scouts** | Systematic compliance | Principles ONLY | Violations that don't fit existing scout domains |

**Example of the gap Layer B fills:**
- Security Scout focuses on vulnerabilities, injection, auth bypass
- But B09 (migration rollback) isn't "security" — it's operational safety
- Database Principles Scout catches B09 violations that Security Scout wouldn't look for

### Layer A: Existing Scout Amplification (Three Structures)

Existing scouts get **three distinct injection structures**:

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXISTING SCOUT                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. PRINCIPLES (baseline + derived)                             │
│     Source: Principle database, filtered by touch overlap       │
│     What: Rules this scout should check                         │
│     Purpose: Systematic rule checking                           │
│     Example: B02, B03, B07, B11                                 │
│                                                                  │
│  2. HETEROGENEOUS PATTERNS (derivedFrom = context/spec)         │
│     Source: InjectionLog — patterns from context pack/spec      │
│     What: "These warnings were given to the creator"            │
│     Purpose: Verify PR complies with what creator was told      │
│     About: The ARTIFACTS being reviewed (code/guidance)         │
│     Example: "SQL injection risk was flagged in context pack"   │
│                                                                  │
│  3. HOMOGENEOUS PATTERNS (derivedFrom = scout)                  │
│     Source: Meta-patterns from judge rejection history          │
│     What: "Don't flag X unless you see Y evidence"              │
│     Purpose: Reduce false positives, calibrate scout behavior   │
│     About: The REVIEW SYSTEM itself (self-referential)          │
│     Example: "Don't flag SQL concat if QueryBuilder is used"    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**The Homogeneous/Heterogeneous Distinction:**

| Type | derivedFrom | About | Self-referential? |
|------|-------------|-------|-------------------|
| **Heterogeneous** | context/spec/test-hardening | The artifacts being reviewed | No — external artifacts |
| **Homogeneous** | scout | The scout's own behavior | Yes — about itself |

- **Heterogeneous = different system** — scouts learning about code/guidance failures
- **Homogeneous = same system** — scouts learning about their own mistakes

### Carrier Stages for Pattern Attribution

Patterns can be attributed to decisions made in different carrier stages:

| Carrier Stage | Produces | Attribution Question | Example Pattern |
|---------------|----------|---------------------|-----------------|
| **context-pack** | Context Pack | "Did context pack guidance cause this?" | "SQL concat guidance led to injection" |
| **spec** | Spec | "Did spec guidance cause this?" | "Incomplete error handling spec led to crashes" |
| **test-hardening** | Test cases | "Did test hardening guidance cause this?" | "Happy-path-only testing missed edge case" |

**Test-Hardening Attribution Flow:**

```
Test Hardening Phase
  └── Decisions made: "Test X this way", "Cover edge case Y"
          │
          ▼
Test Judge Reviews
  └── Finds violation: "This test doesn't actually verify what it claims"
          │
          ▼
Attribution
  └── "The test hardening guidance led to this gap"
          │
          ▼
Heterogeneous Pattern (derivedFrom = test-hardening)
  └── "When hardening tests for validation, don't just check happy path"
          │
          ▼
Future Test Hardening
  └── Gets this pattern injected → avoids same mistake
```

This closes the loop on test quality — not just "did we write tests" but "did our test-writing guidance produce good tests."

---

## Statistical Pattern Detection (Learning Layer)

### The Insight

The current system is **deterministic attribution** — it creates patterns when there's a clear causal link between a decision and a violation. But many violations can't be easily attributed, and many decisions don't immediately cause visible violations.

**The current system is an expert system, not a detection system.**

> **Terminology note:** This section describes statistical *pattern detection* — finding correlations in data. The system *learns* when these detected patterns get injected and change future behavior. True *meta-learning* (learning about learning effectiveness) is a future layer — see "Future: True Meta-Learning" at the end of this document.

### The Limitation of Deterministic Attribution

```
Violation found → Can we trace it to a specific decision?
                        │
                        ├── YES → Create pattern (clear causation)
                        └── NO → Signal lost
```

What we miss:
- Violations without obvious cause
- Decisions that cause problems months later
- Correlations that only emerge across many projects
- Subtle patterns no human would think to specify

### Proposed: Corpus-Based Correlation Learning

**Log everything, even without clear attribution:**

```
┌─────────────────────────────────────────┐
│           RAW EVENT LOG                 │
├─────────────────────────────────────────┤
│ Decisions:                              │
│   - "Used library X" (project A, day 1) │
│   - "Skipped ai_doc" (project B, day 3) │
│   - "Chose retry strategy Y" (proj C)   │
│                                         │
│ Violations:                             │
│   - Timeout issue (project A, day 90)   │
│   - Integration bug (project B, day 45) │
│   - Validation gap (project C, day 30)  │
│                                         │
│ (No explicit links — just raw events)   │
└─────────────────────────────────────────┘
          │
          │ Accumulate over months/years
          ▼
┌─────────────────────────────────────────┐
│       CORRELATION ANALYSIS              │
├─────────────────────────────────────────┤
│ Statistical discovery:                  │
│                                         │
│ "Decisions with property X correlate    │
│  with violations of type Y (p < 0.05)"  │
│                                         │
│ "Projects using library X have 2.3x     │
│  more timeout issues after 60 days"     │
│                                         │
│ "Skipping ai_doc correlates with        │
│  integration bugs (r = 0.67)"           │
└─────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│       DISCOVERED PATTERNS               │
├─────────────────────────────────────────┤
│ Patterns no human specified:            │
│                                         │
│ - "Library X + async code → timeout"    │
│ - "No ai_doc + external API → bugs"     │
│ - "Friday specs → validation gaps"      │
│                                         │
│ These become new patterns/principles    │
│ with statistical confidence scores      │
└─────────────────────────────────────────┘
```

### What This Enables

| Deterministic (Current) | Statistical (Proposed) |
|------------------------|----------------------|
| "This decision caused that violation" | "These tend to co-occur" |
| Needs clear causal chain | Finds hidden correlations |
| Single case → single pattern | N cases → emergent patterns |
| Human-specified rules | Data-discovered rules |
| Immediate feedback | Long-term pattern discovery |

**Patterns you couldn't find deterministically:**
- "Teams that skip ai_doc research have 2.3x more integration bugs"
- "Specs written on Fridays correlate with validation gaps"
- "Decision to use library X correlates with timeout issues 3 months later"
- "Projects with > 5 heterogeneous patterns tend to have architecture issues"

### Data Requirements

For statistical significance:
- Hundreds/thousands of logged decisions
- Hundreds/thousands of logged violations
- Months/years of accumulation
- Cross-project aggregation

### The Difference

| System Type | How It "Learns" |
|-------------|-----------------|
| **Expert system** | Humans specify rules, system follows them |
| **Deterministic attribution** | System creates patterns from clear causal links |
| **Statistical pattern detection** | System discovers patterns humans couldn't specify |

The current system is levels 1-2. This proposal adds level 3 — **actual learning from data**.

### Implementation Considerations

1. **Event schema:** What decisions and violations to log
2. **Correlation engine:** How to find statistically significant patterns
3. **Confidence thresholds:** When is a correlation strong enough to become a pattern
4. **Human review gate:** Discovered patterns should be reviewed before injection
5. **Feedback loop:** Track if discovered patterns actually reduce violations

### Relationship to Current System

```
LAYER 1: Expert rules (baseline principles B01-B11)
    ↓
LAYER 2: Deterministic patterns (clear attribution)
    ↓
LAYER 3: Statistical patterns (correlation discovery)
```

Each layer feeds the others:
- Statistical discovery might validate or refine expert rules
- Discovered correlations become deterministic patterns once understood
- Expert intuition guides what correlations to look for

---

## DecisionGuidance: Formalizing Uncertainty

### The Problem with Single-Number Danger Scales

The original proposal had `unknownDanger: 1-5`, but this conflates two different things:

| Concept | Meaning | Example |
|---------|---------|---------|
| **Epistemic uncertainty** | "We don't know the safe default here" | "Which caching strategy?" — depends on context |
| **Hazard severity** | "If you screw this up, production burns" | "No network timeouts" — well understood but dangerous |

A single scale lies to you: "well-understood but dangerous" gets ranked as "unknown," which is semantically wrong.

### Solution: Two Separate Fields

```typescript
interface DecisionGuidance {
  id: string;

  // Scope: Start PROJECT-scoped to avoid cross-project leakage
  scope: Scope;  // { level: 'project', workspaceId, projectId }

  decisionClass: DecisionClass;  // Reuse existing enum
  title: string;                  // "Timeout selection for outbound calls"
  exampleDecision: string;        // Short example (value + rationale + constraints)

  // TWO SEPARATE SIGNALS (not conflated)
  severity: 1 | 2 | 3 | 4 | 5;           // 5 = severe consequences if wrong
  correlationFactor: 1 | 2 | 3 | 4 | 5;  // 5 = strong decision→violation correlation
  confidence: number;                     // 0-1 evidence strength (separate from severity!)

  // "What might go wrong" as check targets
  // NOTE: Co-occurrence, NOT causation
  potentialConsequences: Array<{
    principleId: string;           // DerivedPrinciple ID (baseline or derived)
    note: string;                  // "Missing timeouts often leads to unbounded waits..."
    association: number;           // 0-1 correlation strength
  }>;

  // Injection filtering (same as patterns)
  touches: Touch[];
  technologies?: string[];
  injectInto: 'context-pack' | 'spec' | 'both';

  // Lifecycle (decay/expire by default)
  status: 'active' | 'archived' | 'expired';
  expiresAt?: string;  // Default 90 days

  createdAt: string;
  updatedAt: string;
}
```

### Surfacing Threshold Matrix

DecisionGuidance is only surfaced when it crosses the threshold for its severity level. Higher severity requires less correlation evidence; lower severity requires strong correlation to justify the noise.

| Severity | Show if correlationFactor ≥ | Rationale |
|----------|----------------------------|-----------|
| **5** (critical) | 2 | High stakes — surface even with weak correlation |
| **4** (high) | 3 | Significant risk — moderate evidence needed |
| **3** (medium) | 4 | Moderate risk — strong correlation required |
| **1-2** (low) | 5 | Low risk — only surface with strongest correlation |

**The intuition:** If severity is high, you want to warn even if correlation is weak (better safe than sorry). If severity is low, only warn when correlation is very strong (otherwise it's noise).

```typescript
function shouldSurfaceGuidance(g: DecisionGuidance): boolean {
  const thresholds: Record<number, number> = {
    5: 2,  // severity=5 → need correlationFactor ≥ 2
    4: 3,  // severity=4 → need correlationFactor ≥ 3
    3: 4,  // severity=3 → need correlationFactor ≥ 4
    2: 5,  // severity=1-2 → need correlationFactor = 5
    1: 5,
  };
  return g.correlationFactor >= thresholds[g.severity];
}
```

### What potentialConsequences Actually Means

**It does NOT mean:** "This decision caused principle B07 to be violated."

**It DOES mean:** "When this decision is missing/weak, we repeatedly observe findings that co-occur with these principles' intent — treat these principles as verification targets."

The prompt should literally say: **"co-occurred historically; not definitive"**

### DecisionGuidance as a Fourth Entity Type

The system now has four "knowledge object" types:

| Entity | What It Is | Example |
|--------|-----------|---------|
| **PatternDefinition** | Bad guidance correlated with a real failure | "SQL concat guidance led to injection" |
| **DerivedPrinciple** | Rule you should follow (baseline or derived) | "Always use parameterized queries" |
| **ProvisionalAlert** | Time-bounded scary thing, don't wait for pattern gate | "Recent SSRF risk — verify explicitly" |
| **DecisionGuidance** | Risk lens — decision area historically failure-prone | "Timeout selection is repeatedly botched" |

DecisionGuidance is NOT a principle (not a rule) and NOT a pattern (not tied to bad guidance text). It's a **risk lens**.

### The Evolution Path

```
DocUpdateRequests accumulate
        │
        ▼
DecisionGuidance emerges (high severity/correlationFactor)
        │
        ▼
Eventually compress into DerivedPrinciple checklist
```

**Example:**
1. **DocUpdateRequests:** "Document timeout choice" × 12 issues
2. **DecisionGuidance:** "Timeout selection is failure-prone (severity=5, correlationFactor=4)"
3. **DerivedPrinciple:** "If touches `network`, require timeout justification in spec"

This aligns with the spec's preference to compress recurring "document X" misses into principles rather than spraying granular patterns.

### Computing DecisionGuidance Without Simpson's Paradox

The danger: accidentally learning "hard tasks cause more everything."

**Minimum viable method:**

1. **Bucket by relevant touches**
   - Only evaluate `decisionClass=timeouts` on tasks where `touches` includes `network`
   - Matches how injection selector weights touches as primary filter

2. **Compare within-bucket**
   ```
   violationRate(decision missing) vs violationRate(decision present)
   ```
   - Use judge-confirmed findings as the label

3. **Require minimum support**
   - Don't emit DecisionGuidance off 3 examples (hallucinating structure from noise)
   - Use thresholds similar to pattern gates (occurrence counts / recurrence)

4. **Compute confidence separately from severity**
   - `confidence` = support size + stability over time
   - `severity` = consequence severity when decision goes wrong
   - `correlationFactor` = strength of decision→violation correlation
   - Matches "belief ≠ action" separation

5. **Build potentialConsequences from co-occurrence**
   - For PRs where "decision missing" AND "violations happened"
   - Count which principles are most relevant (via touches overlap + finding categories)

### Injection Behavior: Additive but Capped

Treat DecisionGuidance like ProvisionalAlerts — high-signal, task-relevant, shouldn't fight the core budget:

| Budget Type | Contents | Cap |
|-------------|----------|-----|
| **Core (6)** | Patterns + Principles | 6 |
| **Additive** | DecisionGuidance | 1-2 |
| **Additive** | ProvisionalAlerts | 2 |
| **Additive** | Adherence/Noncompliance signals | 3 |

Even additive streams need caps to avoid warning fatigue.

### Implementation Strategy

**Start small:**

1. Add DecisionGuidance as **project-scoped**, **expiring by default** (90 days)
2. **Hand-seed initial entries** for known high-risk decision classes:
   - `authz_model` (already flagged as high-risk)
   - `backcompat` (already flagged as high-risk)
   - `logging_privacy` (already flagged as high-risk)
3. Add analytics job **later** to auto-adjust confidence/severity/correlationFactor
4. Reuse "health monitoring mindset" — if guidance misdirects, it must be archivable

**The result:** A system that doesn't just say "make decisions" — it says "these decisions are where we keep stepping on rakes; here are the rakes we usually hit."

---

## Proactive Decision Attribution Loop

### The Problem with Reactive Documentation

Current system only creates DocUpdateRequests when decisions cause findings:

```
Implementation → PR Review → Finding → Attribution → DocUpdateRequest
                             (only if something breaks)
```

**What this misses:**
- Decisions that work now but will break later
- Decisions that are fine but undocumented
- Latent risk that compounds over time

### Proposed: Attribution at Implementation Completion

Run attribution **before PR review**, catching undocumented decisions immediately:

```
Implementation Phase
        │
        ▼
Log all implementor decisions (separate filter)
  - "Used exponential backoff"
  - "Set timeout to 30s"
  - "Chose to validate at boundary"
        │
        ▼
Implementation Complete
        │
        ▼
Attribution Agent (Sonnet)
  For each decision:
        │
        ├── Check 1: Is it in spec/ai_docs?
        └── Check 2: Is it traceable to docs/ (system docs)?
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ATTRIBUTION MATRIX (2x2)                         │
├──────────────────┬──────────────┬───────────────────────────────────┤
│ In Spec/ai_docs? │ In docs/?    │ Outcome                           │
├──────────────────┼──────────────┼───────────────────────────────────┤
│ YES              │ YES          │ Fully attributed ✓                │
│                  │              │ Action: None                      │
├──────────────────┼──────────────┼───────────────────────────────────┤
│ YES              │ NO           │ Spec has it, docs/ doesn't        │
│                  │              │ Action: DocUpdateRequest          │
│                  │              │ "Add this to system docs"         │
├──────────────────┼──────────────┼───────────────────────────────────┤
│ NO               │ YES          │ Docs have it, spec missed it      │
│                  │              │ Action: Pattern (missedDocs)      │
│                  │              │ carrierStage = context            │
│                  │              │ "Context agent failed to surface" │
├──────────────────┼──────────────┼───────────────────────────────────┤
│ NO               │ NO           │ Not documented anywhere           │
│                  │              │ Action: DocUpdateRequest          │
│                  │              │ (most serious - no source exists) │
└──────────────────┴──────────────┴───────────────────────────────────┘

### New Pattern Type: missedDocs

When docs/ has relevant information but it didn't reach the implementor, that's a **context pack failure**:

```typescript
interface MissedDocsPattern {
  type: 'missedDocs';
  carrierStage: 'context';  // Always context - that's where the miss happened

  // What was missed
  docReference: string;      // "docs/systems/architecture/TIMEOUTS.md"
  relevantSection: string;   // Section that should have been included

  // The decision that revealed the miss
  decision: string;          // "Implementor set timeout to 30s"

  // Why it matters
  consequence: string;       // "Implementor had to make undocumented decision"

  // Standard pattern fields
  touches: Touch[];
  technologies?: string[];
}
```

**Why missedDocs matters:**
- The context agent's job is to surface relevant docs
- If relevant docs existed but weren't surfaced → context agent pattern-match failed
- This creates a pattern to help future context agents not miss similar docs

### Attribution by Severity

| Case | In Spec? | In docs/? | Severity | Action | Feedback Loop |
|------|----------|-----------|----------|--------|---------------|
| 1 | YES | YES | None | None | Working as intended |
| 2 | YES | NO | Medium | DocUpdateRequest | "Add spec knowledge to docs/" |
| 3 | NO | YES | High | Pattern (missedDocs) | "Context agent: surface this doc" |
| 4 | NO | NO | Highest | DocUpdateRequest | "No source exists - create it" |

### Full Attribution Flow

```
Decision found in implementation
        │
        ▼
Check 1: Is it in spec/ai_docs?
        │
        ├── YES ─────────────────────────────────────┐
        │                                            │
        │   Check 2: Is it traceable to docs/?       │
        │           │                                │
        │           ├── YES → Case 1: Fully ✓        │
        │           │                                │
        │           └── NO  → Case 2: DocUpdate      │
        │                     "Spec has it,          │
        │                      add to docs/"         │
        │                                            │
        └── NO ──────────────────────────────────────┤
                                                     │
            Check 2: Is it in docs/?                 │
                    │                                │
                    ├── YES → Case 3: missedDocs     │
                    │         Pattern created        │
                    │         carrierStage=context   │
                    │                                │
                    └── NO  → Case 4: DocUpdate      │
                              (highest severity)     │
                              "Create new doc"       │
```
```

### Decision Stage Attribution

Decisions need the same traceability as patterns:

```typescript
interface DecisionLog {
  id: string;

  // Where was this decision made?
  decisionStage: 'context-pack' | 'spec' | 'implementation';

  // What informed it? (if attributable)
  informedBy?: {
    stage: 'docs' | 'context-pack' | 'spec';
    reference?: string;  // "ai_docs/httpx.md" or "spec section 4.2"
  };

  // The decision itself
  decision: string;
  location: { file: string; line: number };
  timestamp: Date;

  // Attribution status
  attributed: boolean;
}
```

**Full attribution chain:**

| decisionStage | informedBy | Attribution | Fix Location |
|---------------|------------|-------------|--------------|
| context-pack | ai_docs/httpx.md | "ai_doc led to CP decision" | Update ai_doc |
| spec | context-pack section 3 | "CP led to spec decision" | Update CP process |
| implementation | spec section 4.2 | "Spec led to impl decision" | Update spec |
| implementation | (none found) | **Undocumented** | Create doc |

### What This Catches

| Scenario | Reactive (Current) | Proactive (Proposed) |
|----------|-------------------|---------------------|
| Decision causes immediate finding | ✓ Caught | ✓ Caught |
| Decision works now, breaks later | ✗ Missed until break | ✓ Caught (no attribution) |
| Decision is fine but undocumented | ✗ Missed entirely | ✓ Caught |

### Latent Risk: Time Compounds Danger

Undocumented decisions aren't static risks — they're **time bombs**:

```
Day 1:    Decision made, works fine, not documented
Day 90:   Still works, still undocumented
Day 180:  New requirement arrives
Day 181:  Developer changes code (doesn't know the rationale)
Day 182:  Production breaks
Day 183:  Finding attributed to... what? (chain broken)
```

**Risk compounds over time:**

```
effectiveRisk = baseRisk × (1 + (daysSinceDecision / 90) × latentRiskMultiplier)

Day 1:   risk × 1.0
Day 90:  risk × 1.5
Day 180: risk × 2.0
```

**Prioritization:** Older undocumented decisions should be flagged with higher urgency.

### Implementation Sketch

```typescript
interface ImplementorDecisionLog {
  implementationId: string;
  issueId: string;
  decisions: DecisionLog[];
}

// Run at implementation completion, before PR review
async function attributeImplementorDecisions(log: ImplementorDecisionLog) {
  const unattributed: DecisionLog[] = [];

  for (const decision of log.decisions) {
    const attribution = await attributionAgent.findSource(decision, {
      searchIn: ['spec', 'ai_docs', 'arch_docs'],
      issueId: log.issueId
    });

    if (attribution.found) {
      decision.attributed = true;
      decision.informedBy = attribution.source;
    } else {
      decision.attributed = false;
      unattributed.push(decision);
    }
  }

  // Create DocUpdateRequests for unattributed decisions
  for (const decision of unattributed) {
    await createDocUpdateRequest({
      reason: 'undocumented_decision',
      decision: decision.decision,
      location: decision.location,
      suggestedDoc: inferBestDocLocation(decision),
      priority: calculateLatentRiskPriority(decision)
    });
  }

  // Log all decisions for meta-learning (attributed or not)
  await decisionCorpus.log(log);
}
```

### Benefits

| Aspect | Improvement |
|--------|-------------|
| **Timing** | Flags undocumented decisions immediately, not when they break |
| **Context** | Documentation written while decision is fresh |
| **PR Review** | Can focus on correctness, not archaeology |
| **Pattern detection** | All decisions logged for corpus-based correlation |
| **Latent risk** | Time bombs defused before they explode |

### Integration with Pattern Detection

The same decision log feeds two purposes:

```
Decision Log
     │
     ├── Proactive Attribution Loop
     │   └── DocUpdateRequests for undocumented decisions
     │
     └── Pattern Detection Corpus
         └── Correlation analysis over time
```

This means every decision is:
1. Checked for documentation (immediate value)
2. Logged for pattern discovery (long-term learning)

**Summary of three structures:**

| # | Structure | Answers | derivedFrom |
|---|-----------|---------|-------------|
| 1 | Principles | "What rules should I check?" | N/A (baseline or derived from patterns) |
| 2 | Heterogeneous Patterns | "What was the creator warned about?" | context/spec (InjectionLog) |
| 3 | Homogeneous Patterns | "What mistakes do I keep making?" | scout (judge rejection history) |

**Per-scout mapping:**

| Scout | Principles | Heterogeneous Patterns | Homogeneous Patterns |
|-------|------------|----------------------|---------------------|
| Security Scout | B02, B03, B07, B11 | Security warnings from InjectionLog | Security scout precision rules |
| Docs Scout | Doc-related principles | Doc warnings from InjectionLog | Docs scout precision rules |
| Decisions Scout | Architectural principles | Decision warnings from InjectionLog | Decisions scout precision rules |
| Test Scout | Testing principles | Test warnings from InjectionLog | Test scout precision rules |
| Patterns Scout | Code pattern principles | Pattern warnings from InjectionLog | Patterns scout precision rules |

**How each structure helps:**

| Structure | Scout Behavior Change |
|-----------|----------------------|
| Principles | "Rule B03 applies here — let me check for violations" |
| Heterogeneous Patterns | "The creator was warned about X — I must verify they followed it" |
| Homogeneous Patterns | "I've been wrong about Y before — I'll be more careful" |

### Layer B: Principle Compliance Scouts (Systematic)

Dedicated scouts whose **ONLY job** is checking principle compliance. Grouped by **touch/risk surface**, not arbitrary chunks:

| Principle Scout | Principles | Activated When |
|-----------------|------------|----------------|
| Database Principles Scout | B01, B02, B08, B11 + derived DB | PR touches `database` |
| Network Principles Scout | B05, B06, B07 + derived network | PR touches `network` |
| Auth Principles Scout | B04 + derived auth | PR touches `auth` or `authz` |
| Schema Principles Scout | B09 + derived migration | PR touches `schema` or `migration` |
| API Principles Scout | B10 + derived API | PR touches `api` |

**Key design decisions:**

1. **NO patterns** — Principle scouts only check rules, they don't need "what went wrong" stories
2. **Grouped by touch** — One scout per risk surface, not arbitrary 6-principle chunks
3. **Relevance-selected** — Only activate scouts for touched areas (based on ReviewProfile)
4. **~3-5 scouts per PR** — Most PRs don't touch all areas

### Principle Scout Design (Sonnet, Parallel)

```markdown
# Scout: Database Principles Compliance

**Model:** Sonnet
**Activated when:** ReviewProfile.touches includes 'database'
**Principles assigned:** [B01, B02, B08, B11, D-db-001, D-db-002]

For each principle:
1. Read the principle definition
2. Scan changed files for potential violations
3. Flag findings with REQUIRED evidence:
   - principle_id
   - file + line range
   - code snippet (quoted diff hunk)
   - brief "why this violates Principle Bxx"
   - confidence score (0-1)

Output: List of potential violations (Judge will filter false positives)
```

### Principles Judge Design (Single, Opus)

One judge reviews ALL findings from both Layer A and Layer B:

```markdown
# Judge: Principles Compliance

**Model:** Opus
**Input:** Aggregated findings from all scouts (existing + principle scouts)

For each finding:
1. Is this actually a violation? (not a false positive)
2. Is the principle applicable to this context?
3. Does evidence meet the bar? (file+line, snippet, reasoning required)
4. Severity: Does violation match the principle's stated impact?
5. De-duplicate: Same violation flagged by multiple scouts?

Evidence requirements (STRICT):
- Reject findings without file + line range
- Reject findings without code snippet
- Reject findings without clear reasoning

Verdict per finding: CONFIRMED / DISMISSED with reasoning

Final output: Consolidated list of confirmed violations
```

**Why single Opus judge:**
- Consistency — one model making all final calls
- Quality — Opus has better reasoning for nuanced decisions
- Evidence-strict — can enforce evidence requirements uniformly
- De-duplication — spots when multiple scouts flagged same issue

### Principle Violations Feed Attribution

When a principle violation is confirmed, attribution decides:

```
Principle violation confirmed (e.g., B03 violated)
        │
        ▼
Was this principle/guidance injected for this issue?
        │
        ├── YES, agent ignored it
        │   └── ExecutionNoncompliance
        │
        ├── NO, but should have been (task profile was wrong)
        │   └── TaggingMiss
        │
        └── Guidance in context/spec was harmful/ambiguous
            └── New Pattern
```

### FindingCategory Mapping

Don't add `FindingCategory = 'principles'`. Map to existing categories:

| Principle | FindingCategory |
|-----------|-----------------|
| B01 SQL parameterization | `security` |
| B03 Fail-fast on invalid state | `correctness` |
| B09 Migration rollback | `decisions` |
| B10 Error contract | `correctness` or `compliance` |

Keeps downstream pipeline (severity, attribution routing, promotion gates) unchanged.

### Expected Impact

- **Earlier detection:** Catch violations before they become PR findings
- **Systematic coverage:** Every relevant principle checked
- **Reduced false positives:** Evidence-strict judge + touch-grouped scouts
- **Attribution feedback:** Violations feed into ExecutionNoncompliance / TaggingMiss / Pattern creation

### Implementation Phases

1. **Phase 1:** Add Layer A injection (patterns + principles into existing scouts)
2. **Phase 2:** Add Layer B principle scouts (grouped by touch)
3. **Phase 3:** Add evidence-strict judge requirements
4. **Phase 4:** Connect violations to attribution loop

### ExecutionNoncompliance Injection

When an agent ignores correct guidance, it creates an ExecutionNoncompliance record. These records feed back into scouts to strengthen detection of repeat offenses.

**What ExecutionNoncompliance captures:**
- The guidance that was given (pattern/principle ID)
- The violation that occurred despite the guidance
- The issue/PR where it happened

**Injection into scouts:**

```
ExecutionNoncompliance records (last 30 days)
        │
        ▼
Filter by touch overlap with current PR
        │
        ▼
Inject as "Known Blind Spots":

"⚠️ HISTORICALLY IGNORED (agents received this guidance but violated anyway):
 - Input validation at API boundary (3 violations in 30 days)
 - Timeout specification for external calls (2 violations in 30 days)

 These are known weak spots. Verify explicitly."
```

**Why this matters:**
- ExecutionNoncompliance indicates the guidance is correct but not persuasive enough
- Scouts should be extra vigilant on these areas
- Creates pressure to either fix the guidance wording or add enforcement

**Injection budget:**
| Injection Type | Target | Cap |
|---------------|--------|-----|
| ExecutionNoncompliance highlights | All scouts | 3 |

**Threshold for injection:**
- Only inject if ≥ 2 noncompliances in last 30 days for this guidance
- Prevents noise from one-off mistakes
- Matches SalienceIssue detection threshold

---

## Scout/Judge Injection

### The Insight

Currently, pattern injection targets **creators** (context pack, spec, implementation). But scouts and judges are the **enforcement point** — where you actually catch issues. This is a big unused lever.

```
CURRENT:
Creators get injection → try to prevent mistakes
Scouts/Judges get nothing → find issues ad-hoc

PROPOSED:
Creators get injection → try to prevent mistakes
Scouts/Judges get injection → systematically verify compliance
```

### 1. Adherence Checklist (Highest Value)

**The idea:** You already log what was injected via `InjectionLog`. Use it at PR review.

```
PR Review starts for CON-456
        ↓
Query InjectionLog for CON-456
        ↓
Found: 3 patterns injected into Context Pack
       2 patterns injected into Spec
        ↓
Inject into scouts as "Adherence Checklist":

"These warnings were given for this issue. Verify the PR complies:
 - [ ] SQL injection risk (B03 + P-a1b2c3) — parameterized queries only
 - [ ] Retry backoff (P-d4e5f6) — exponential with jitter
 - [ ] Connection lifecycle (P-g7h8i9) — explicit cleanup"
```

**Why this is powerful:**
- It's not generic guidance — it's **the exact set of things your system predicted were risky for this task**
- Directly strengthens **ExecutionNoncompliance** detection
- If system warned "don't do X" and PR does X, scouts should reliably catch it

**Implementation:**
```typescript
// At PR review kickoff:
const injectionLogs = await InjectionLog.find({ issueId });
const injectedPatterns = await fetchPatterns(injectionLogs.map(l => l.patternId));
const adherenceChecklist = formatAsChecklist(injectedPatterns);
// Inject into scouts (or dedicated "Adherence Scout")
```

### 2. Salience Hotlist

**The idea:** `SalienceIssue` tracks guidance that's correct but agents keep ignoring (3+ noncompliances in 30 days). That's review gold.

```
SalienceIssue: "Input validation at API boundary"
  - Noncompliance 1: CON-123 (2 weeks ago)
  - Noncompliance 2: CON-456 (1 week ago)
  - Noncompliance 3: CON-789 (3 days ago)
        ↓
Inject into scouts:

"⚠️ HIGH-RISK (repeatedly ignored — verify explicitly):
 - Input validation at API boundary
 - Async timeout handling"
```

**Why this matters:**
- These are known blind spots
- Data-backed way to focus review attention
- No new machinery needed — just query existing SalienceIssue records

### 3. ProvisionalAlerts into Security Scout

**The idea:** `ProvisionalAlert` represents high-severity novel risks that don't meet the learned-pattern gate yet. They're time-bounded (TTL), so they don't become permanent noise.

Currently aimed at context/spec creation, but **even more valuable at PR review**:
- They represent "recent scary things"
- Security scout should be aware of them

```
Inject into Security Scout:

"🔴 RECENT THREATS (provisional — verify explicitly):
 - SSRF risk: Validate and allowlist URLs before fetching external resources
   (expires in 12 days)"
```

### Scout/Judge Injection Summary

| Injection Type | Target | Source | Value |
|---------------|--------|--------|-------|
| Adherence Checklist | All scouts | InjectionLog for this issue | **Highest** — exact warnings given |
| Salience Hotlist | All scouts | Active SalienceIssues by touch | High — known blind spots |
| ProvisionalAlerts | Security Scout/Judge | Active ProvisionalAlerts by touch | High — recent threats |
| Targeted Principles | Per-scout by focus area | Principle database | High — amplifies detection |
| Relevant Patterns | Per-scout by focus area | Pattern database | Medium — historical context |

### Targeted Scout Injection

Inject **relevant principles and patterns into existing scouts** based on their focus area:

```
CURRENT:
Security Scout → uses own judgment to find security issues

PROPOSED:
Security Scout + [B02, B03, B07, B11] + [security patterns] → amplified detection
```

**Scout-to-Principle Mapping:**

| Scout | Inject Principles | Inject Patterns |
|-------|------------------|-----------------|
| Security Scout | B02 (defensive deser), B03 (fail-fast), B07 (SQL), B11 (least privilege) | Security patterns by touch overlap |
| Docs Scout | Documentation-related principles | Patterns where doc gaps caused failures |
| Patterns Scout | Code pattern principles | High-confidence learned patterns |
| Decisions Scout | Architectural decision principles | Decision-related patterns |
| Test Scout | Testing principles (coverage, isolation) | Patterns where test gaps caused issues |

**Benefits:**
- Scouts get **specific things to check** (not just "find issues")
- **Historical context** ("this type of gap caused problems in CON-234")
- **Calibration** (principles are known-good, not invented on the fly)

It's like giving a code reviewer a checklist of "things that have bitten us before."

---

## Scout Auditor Layer

### The Insight

Scouts are Sonnet, optimized for speed and specific focus. They can miss things. We need a **safety net** that audits scout outputs against the known risk list.

### Architecture

```
LAYER 1: Amplified Scouts
─────────────────────────
Security Scout + [principles + patterns]
Docs Scout + [principles + patterns]
Decisions Scout + [principles + patterns]
        │
        ▼
    Scout findings (may have gaps)

LAYER 2: Scout Auditor (NEW)
────────────────────────────
    Scout findings
        │
        ▼
    Scout Auditor (Sonnet)
        │
        │  Cross-checks against:
        │  - Injected principles (did scouts check these?)
        │  - Adherence checklist (did scouts verify compliance?)
        │  - Salience hotlist (did scouts check blind spots?)
        │  - Cross-scout gaps (issues spanning multiple domains?)
        │
        ▼
    Augmented findings = scout findings + auditor catches
        │
        ▼
    Judge (Opus) ── final verdicts
```

### What the Scout Auditor Catches

| Gap Type | Detection Method | Example |
|----------|------------------|---------|
| **False negatives** | Principle injected, code violates, no scout flagged | B03 injected, code has bare exception, Security Scout missed it |
| **Adherence misses** | Warning in InjectionLog, PR violates, not flagged | "Use parameterized queries" warning given, PR concatenates SQL, not caught |
| **Blind spot repeats** | SalienceIssue exists, scouts didn't explicitly check | "Input validation" has 5 noncompliances, scouts didn't verify |
| **Cross-scout gaps** | Issue spans multiple scout domains | Auth + database issue — Security Scout saw auth, Patterns Scout saw DB, neither connected them |

### Scout Auditor Design

```markdown
# Scout Auditor

**Model:** Sonnet
**Input:**
- All scout findings
- Injected principles for this PR
- Adherence checklist (from InjectionLog)
- Active SalienceIssues by touch
- ReviewProfile (what the PR actually changes)

**Task:**
You are NOT re-reviewing the code. You are auditing whether scouts checked what they should have.

For each item in the risk list (principles + adherence + salience):
1. Was this risk area explicitly addressed by any scout finding?
2. If not, does the PR touch code where this risk applies?
3. If yes to #2 but no to #1, flag as POTENTIAL GAP

**Output:**
- List of potential gaps (risk was relevant but not checked)
- Confidence per gap (how likely scouts missed something vs. not applicable)
- Recommended: which scout SHOULD have caught this

**Important:** You are a safety net, not a replacement. Keep false positive rate low.
Only flag gaps where:
- The risk clearly applies to changed code
- No scout addressed it (even tangentially)
```

### Auditor Output Format

```typescript
interface AuditorFinding {
  gapType: 'false_negative' | 'adherence_miss' | 'blind_spot' | 'cross_scout_gap';
  riskItem: {
    type: 'principle' | 'pattern' | 'salience' | 'adherence';
    id: string;
    description: string;
  };
  relevantCode: {
    file: string;
    lines: [number, number];
    snippet: string;
  };
  shouldHaveBeenCaughtBy: string;  // scout type
  confidence: number;              // 0-1
  reasoning: string;
}
```

### Why This Layer Matters

| Without Auditor | With Auditor |
|-----------------|--------------|
| Scout misses → Judge never sees it → Issue ships | Scout misses → Auditor catches → Judge reviews → Issue caught |
| Adherence warnings are "best effort" | Adherence warnings are systematically verified |
| Blind spots stay blind | Blind spots get explicit coverage |
| Cross-domain issues fall through | Cross-domain issues get flagged |

### Cost/Benefit

| Aspect | Impact |
|--------|--------|
| **Added latency** | +1 Sonnet call (parallel with judge prep) |
| **Added cost** | ~$0.01-0.02 per PR |
| **Catch rate** | Estimated 10-20% more issues caught |
| **False positive risk** | Low if auditor is well-calibrated |

### Implementation Priority

1. **Phase 1:** Adherence checking only (highest value, lowest complexity)
2. **Phase 2:** Add principle coverage checking
3. **Phase 3:** Add cross-scout gap detection
4. **Phase 4:** Add blind spot (SalienceIssue) checking

---

## Meta-Patterns: Learning About Scouts/Judges

### The Insight

Current learned patterns are about **bad guidance in carriers** (context pack/spec). But there's an untapped dataset: **scout findings + judge verdicts**.

From that, you can learn two "meta-pattern" families:
1. **Scout precision patterns** — reduce false positives
2. **Judge calibration patterns** — reduce inconsistent adjudication

### Scout Precision Patterns

**Detect:** Same scout type repeatedly raises similar findings that judges reject.

```
Scout: Documentation Scout
Finding: "Missing error handling documentation"
  - Raised 15 times in last 30 days
  - Judges rejected 12 of them
  - Rejection reason: "acceptable per repo standard" (80%)
        ↓
Generate precision rule:

"Don't flag missing error handling docs unless you verify
 it's not using the repo's ErrorBoundary wrapper pattern."
```

**Implementation:**

```typescript
// Create deterministic findingKey (like patternKey):
const findingKey = hash(normalize(title + claim + locationSignature));

// Track outcomes:
interface ScoutFindingOutcome {
  findingKey: string;
  scoutType: string;
  outcome: 'confirmed' | 'rejected';
  rejectionReason?: RejectionCode;  // enum: insufficient_evidence, repo_standard, false_positive, not_in_scope
}

// When cluster hits threshold (e.g., 10 occurrences, 80% rejected):
// Generate precision rule and inject into that scout
```

**Inject into scout:**
```
"PRECISION RULES (from historical outcomes):
 - Don't flag X unless you see Y evidence
 - If you flag X, you must include Z proof (file/line, reproduction)"
```

### Judge Calibration Patterns

**Detect:** Judges disagree heavily or flip-flop on similar findings.

```
Finding type: "SQL concatenation"
Judge verdicts over last 60 days:
  - 40% CONFIRMED
  - 60% DISMISSED (reason: "uses safe query builder")
        ↓
Generate calibration rule:

"When reviewing SQL concatenation findings, check if QueryBuilder
 wrapper is used — if so, dismiss unless raw SQL detected."
```

**Implementation:**

```typescript
// Require judges to output structured rationale code:
enum RejectionCode {
  INSUFFICIENT_EVIDENCE = 'insufficient_evidence',
  REPO_STANDARD = 'acceptable_per_repo_standard',
  SAFE_WRAPPER = 'false_positive_safe_wrapper',
  NOT_IN_SCOPE = 'not_in_scope',
  // ... 6-10 enums is enough
}

// Compute disagreement rates by:
// - scoutType
// - technology/touch
// - findingKey clusters

// When inconsistency detected, generate calibration rule
```

**Critical phrasing:** Frame as **evidence requirements**, not conclusions:

| ❌ Bad (biases verdict) | ✅ Good (requires evidence) |
|------------------------|----------------------------|
| "Reject findings about X" | "Only confirm X if evidence includes Y" |
| "Always dismiss SQL concat" | "Check for QueryBuilder before confirming SQL concat" |
| "Ignore auth findings" | "Auth findings require proof of missing check, not just missing comment" |

### Meta-Pattern Summary

| Pattern Type | Detects | Injected Into | Benefit |
|--------------|---------|---------------|---------|
| Scout Precision | High false positive rate | Specific scout | Reduces noise |
| Judge Calibration | Inconsistent verdicts | Judges | More deterministic judging |

---

## ReviewProfile Extractor

### The Insight

**Currently:** TaskProfile comes from issue metadata (title, description, constraints).

**Problem:** By PR review time, you have much richer information — the **actual code diff**.

### Proposed: ReviewProfile

Extract profile from the PR diff itself, not just issue metadata:

```typescript
interface ReviewProfile {
  // Inferred from changed files + imports
  touches: Touch[];
  technologies: string[];

  // Inferred from file paths
  changedAreas: string[];  // ['src/auth/', 'src/api/users/']

  // Risk assessment
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];   // ['auth + database combo', 'new external API']

  // Confidence in this extraction
  confidence: number;
}
```

### Extraction Logic

```typescript
function extractReviewProfile(prDiff: PRDiff): ReviewProfile {
  const touches = new Set<Touch>();
  const technologies = new Set<string>();

  for (const file of prDiff.changedFiles) {
    // Infer from file path
    if (file.path.includes('/auth/')) touches.add('auth');
    if (file.path.includes('/api/')) touches.add('api');
    if (file.path.includes('/db/')) touches.add('database');

    // Infer from imports
    for (const import of file.addedImports) {
      if (import.includes('sqlalchemy')) technologies.add('sql');
      if (import.includes('httpx')) technologies.add('http');
      if (import.includes('redis')) technologies.add('redis');
    }

    // Infer from code patterns
    if (file.diff.includes('user_input') || file.diff.includes('request.')) {
      touches.add('user_input');
    }
  }

  // Risk assessment
  const riskFactors = [];
  if (touches.has('auth') && touches.has('database')) {
    riskFactors.push('auth + database combo');
  }
  if (touches.has('user_input') && touches.has('database')) {
    riskFactors.push('user input to database flow');
  }

  return {
    touches: Array.from(touches),
    technologies: Array.from(technologies),
    changedAreas: prDiff.changedFiles.map(f => dirname(f.path)),
    riskLevel: riskFactors.length >= 2 ? 'high' : riskFactors.length === 1 ? 'medium' : 'low',
    riskFactors,
    confidence: 0.8  // Higher than issue-based extraction
  };
}
```

### Benefits

| Aspect | TaskProfile (issue-based) | ReviewProfile (diff-based) |
|--------|---------------------------|----------------------------|
| **Source** | Issue title/description | Actual code changes |
| **Accuracy** | Depends on issue quality | Reflects reality |
| **Timing** | Available at task start | Available at PR review |
| **Use case** | Creation-time injection | Review-time injection |

### Usage

```typescript
// At PR review kickoff:
const reviewProfile = extractReviewProfile(prDiff);

// Select patterns for scouts based on ACTUAL changes, not issue metadata:
const relevantPatterns = selectPatterns({
  touches: reviewProfile.touches,
  technologies: reviewProfile.technologies,
  riskLevel: reviewProfile.riskLevel
});

// Higher risk = more patterns injected
const budget = reviewProfile.riskLevel === 'high' ? 18
             : reviewProfile.riskLevel === 'medium' ? 12
             : 8;
```

This avoids injecting 18 generic patterns into every scout — you select based on **what the PR actually changes**.

---

## Future: True Meta-Learning (Layer 3)

### The Three-Layer Architecture

The guardrail system has three distinct layers:

```
LAYER 1: Pattern-Based Guardrails (detection + injection)
         └── Current spec (v1)
         └── Patterns, Principles, ProvisionalAlerts
         └── Deterministic attribution

LAYER 2: Statistical Pattern Detection (learning)
         └── This document (future enhancements)
         └── DecisionGuidance, Scout Precision Patterns, etc.
         └── Correlation-based pattern discovery

LAYER 3: Meta-Learning (learning about learning)
         └── Future-future
         └── DecisionGroups
         └── Learning which guidance is effective
```

### What True Meta-Learning Means

**Layer 2 (detection):** "Decision class X correlates with violations"
**Layer 3 (meta-learning):** "When we warned about X, decisions of type Y still failed"

Meta-learning is learning about the effectiveness of our own guidance:
- Which DecisionGuidance actually helps?
- Which specific decisions within a guidance area still cause problems?
- How do we refine guidance based on observed outcomes?

### DecisionGroups: Refining Guidance

When DecisionGuidance is injected, agents make decisions influenced by it. We can track those decisions and correlate with outcomes:

```
Layer 2: DecisionGuidance injected
         "Timeout selection is failure-prone"
                    │
                    ▼
Agent makes decisions in that area:
  - "chose 3s timeout for DB call"
  - "chose 30s timeout for external API"
  - "chose 5s timeout for DB call"
                    │
                    ▼
Log decisions with attribution:
  { decision: "3s for DB", influencedBy: "DG-timeout-123" }
                    │
                    ▼
Correlate with outcomes:
  "< 10s for DB calls" → 80% violation rate
  "> 20s for external" → 10% violation rate
                    │
                    ▼
Layer 3: DecisionGroup created
  parentGuidance: "DG-timeout-123"
  pattern: "short timeouts for database calls"
  severity: 5
  correlationFactor: 4
```

### DecisionGroup Schema

```typescript
interface DecisionGroup {
  id: string;
  parentGuidance: string;  // DecisionGuidance ID

  // The specific decision pattern within this guidance area
  pattern: string;          // "short timeouts (< 10s) for database calls"
  exampleDecisions: string[];

  // Correlation with outcomes
  severity: 1 | 2 | 3 | 4 | 5;
  correlationFactor: 1 | 2 | 3 | 4 | 5;

  // Evidence
  occurrenceCount: number;
  violationRate: number;    // 0-1

  // Standard fields
  touches: Touch[];
  technologies?: string[];
  status: 'active' | 'archived';
  createdAt: string;
}
```

### Critical: Injection Split (Anti-Gaming)

**DecisionGroups ONLY go to PR review scouts, NOT to creators.**

```
Creation phases (context pack, spec):
  └── DecisionGuidance only
  └── "Timeout selection is failure-prone"
  └── General awareness — agent makes genuine decisions

PR Review scouts:
  └── DecisionGuidance + DecisionGroups
  └── "Timeout selection is failure-prone"
      └── "Specifically, check for short DB timeouts"
  └── Detailed verification checklist
```

**Why this split is critical:**

If creators know the specific patterns that trigger findings:
- They optimize for "avoids findings" not "good code"
- Gaming: use 10.1s instead of 10s to dodge a threshold
- Goodhart's Law: metric becomes the target, loses meaning

By splitting injection:
- Creators get awareness, make genuine decisions based on context
- Scouts have detailed checks creators can't game
- System rewards good thinking, not pattern avoidance

**"Avoids findings" ≠ "good code"**

### Why This Is Meta-Learning

| Layer | What It Learns |
|-------|---------------|
| **Layer 2** | "Decision area X correlates with violations" (pattern detection) |
| **Layer 3** | "Our guidance about X leads to decision pattern Y which still fails" (meta-learning) |

Layer 3 learns about the effectiveness of Layer 2's guidance. It's learning to give better guidance, not just more guidance.

---

### The Quarantine Design Philosophy

Keeping meta-learned patterns in scouts is a **quarantine design** that prevents builders from converging on weird local optima.

```
BUILDERS (context/spec/implementor):
  └── Get DecisionGuidance only
  └── "Risk lens / decision prompt"
  └── Helps them make explicit decisions
  └── Does NOT over-steer with shaky correlations

REVIEW (scouts/judges):
  └── Gets DecisionGroups (learned patterns)
  └── Can be skeptical, evidence-strict
  └── Judge can dismiss nonsense
  └── Enforcement point, not steering point
```

This matches the "builders need focus, reviewers need coverage" philosophy.

### Why Quarantine Reduces Convergence Risk

#### 1. Moves Uncertain Learning to the Least Dangerous Place

Meta-learning outputs (DecisionGroup patterns) are inherently "correlation-y." If injected into builders:
- Builders optimize for "avoid patterns that look scary" instead of "solve the task"
- Builders overfit to statistical ghosts ("don't use library X ever")
- Paralysis / prompt bias ("this looks dangerous so I'll do something simpler but wrong")

If those signals live **only in scouts**:
- They increase detection without shaping the initial solution trajectory
- Review can reject bad changes; build can still pursue the spec

#### 2. Scouts + Evidence-Strict Judge = Built-in Debiasing

Scouts can be noisy; judges can be strict. If a DecisionGroup pattern is wrong:
- Extra scout noise → judge dismisses (with a reason code)
- Signal to downgrade/expire the pattern

Far safer than having builders rewrite the whole spec because a correlation engine had a fever dream.

---

### Two Important Caveats

#### Caveat A: Review Can Still Steer Indirectly

If scouts flag wrong things and judges are too permissive (or teams treat scout findings as "must fix"), **review becomes the steering mechanism** — convergence happens later in the pipeline.

The safety of "review-only meta-learning" depends on:
- **Evidence requirements** (strict)
- **Judge strictness** (dismiss weak correlations)
- **Phrasing** learned patterns as *verification targets*, not mandates

#### Caveat B: Trades Prevention for Rework

If builders don't see "DecisionGroup says option Y is often bad," they'll keep choosing it, and the system will keep catching it in PR review.

This means:
- More PR churn
- Slower feedback to the author
- Higher cost per caught issue

This is the classic **safety-first quarantine tradeoff**. Acceptable early (while learning is immature), but eventually you want a promotion path.

---

### The Promotion Ladder

The quarantine split is a great **Phase 1 default**. Add a graduation path so you don't permanently pay the rework tax.

#### Stage 0: Shadow Mode

DecisionGroup patterns are computed, stored, scored — **but not injected anywhere**.

Use this to measure:
- False positive rate (how often would it have complained?)
- Predictive value (how often does it match confirmed negative outcomes?)

#### Stage 1: Scout-Only, Advisory Wording

Inject into **Decisions Scout** (and Auditor), phrased like:

```
"If you see decision shape X, explicitly verify Y and Z.
This is correlation-based; require hard evidence."
```

Aligns with "reviewers need coverage" + "warning fatigue is real."

#### Stage 2: Scout-Only, Enforceable (High-Confidence Only)

Once support is high and the judge confirms repeatedly, allow patterns to influence severity or prioritization — still **not** builder steering.

#### Stage 3: Promote to Builder-Facing Objects (Rare, Gated)

Only when a DecisionGroup insight becomes *stable and interpretable* should it get promoted into:
- Updated **DecisionGuidance** (better prompts/examples), or
- A **DerivedPrinciple** checklist (if it truly becomes "rule-like")

This fits the "statistical discovery → becomes real guardrail once understood" arc.

```
Shadow Mode ──► Scout Advisory ──► Scout Enforceable ──► Builder-Facing
   (observe)      (soft signal)     (hard signal)         (guidance/principle)
```

---

### Implementation: Separate Type, Not PatternDefinition

**Critical:** DecisionGroup patterns are NOT the same as v1 PatternDefinitions.

| Entity | About | Carrier Stage |
|--------|-------|---------------|
| **PatternDefinition** | Bad guidance in context/spec carriers | context/spec/test-hardening |
| **DecisionGroupRiskNote** | Decision-shape risk patterns | **review-only** |

Mixing them will poison retrieval and confuse attribution.

```typescript
interface DecisionGroupRiskNote {
  id: string;
  parentGuidance: string;  // DecisionGuidance ID

  // The specific decision pattern
  pattern: string;
  exampleDecisions: string[];

  // Correlation strength
  severity: 1 | 2 | 3 | 4 | 5;
  correlationFactor: 1 | 2 | 3 | 4 | 5;
  confidence: number;  // 0-1

  // Evidence
  occurrenceCount: number;
  violationRate: number;

  // REVIEW-ONLY injection
  injectInto: 'review';  // Never 'context-pack' or 'spec'

  // Lifecycle (must expire/decay)
  status: 'shadow' | 'advisory' | 'enforceable' | 'promoted' | 'archived';
  expiresAt: string;  // Required — non-stationarity is real
  promotedTo?: string;  // DecisionGuidance or DerivedPrinciple ID if promoted

  touches: Touch[];
  technologies?: string[];
  createdAt: string;
  updatedAt: string;
}
```

This becomes a **fourth review-only structure** alongside:
1. Principles
2. Heterogeneous patterns (from InjectionLog)
3. Homogeneous patterns (scout precision rules)
4. **DecisionGroupRiskNotes** (meta-learned decision patterns)

---

### Three Guardrails for Robust Meta-Learning

To avoid "wrong task convergence," require:

| Guardrail | Purpose |
|-----------|---------|
| **1. Judge evidence strictness** | Meta-learned signals never auto-win; require hard evidence |
| **2. Expiry / decay** | DecisionGroupRiskNotes must expire; non-stationarity is real |
| **3. Promotion ladder** | Review-only until proven; optionally elevate to DecisionGuidance/DerivedPrinciple |

This combo gets you "learning" without letting the system hypnotize itself into solving the wrong problem.

---

### Summary: Does This Avoid Wrong Task Convergence?

**Mostly, yes — this is one of the safest ways to introduce meta-learning.**

Because learning outputs stay on the **verification side** (where you can demand evidence and dismiss bad correlations) instead of the **generation side** (where they quietly steer the entire plan).

The quarantine design:
- **Reduces** convergence risk (doesn't eliminate it)
- Requires evidence strictness + expiry + promotion ladder
- Trades some prevention for rework (acceptable while learning is immature)
- Provides a path to graduate stable patterns into builder-facing guidance

---

### Implementation: Future-Future

This layer requires:
1. DecisionGuidance injection working (Layer 2)
2. Decision logging with `influencedBy` attribution
3. Correlation engine tracking decisions→outcomes within guidance areas
4. Threshold gates for DecisionGroupRiskNote creation (minimum support, minimum correlation)
5. Scout injection infrastructure for DecisionGroupRiskNotes
6. Promotion ladder state machine (shadow → advisory → enforceable → promoted)

**Sequence:**
1. Build Layer 2 (DecisionGuidance, statistical pattern detection)
2. Observe effectiveness for 6+ months
3. Add `influencedBy` tracking to decision logs
4. Build DecisionGroupRiskNote detection (shadow mode first)
5. Add scout-only injection (advisory wording)
6. Add promotion ladder and expiry enforcement
