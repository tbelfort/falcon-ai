# Meta-Learning Pattern Types for AI Agent Orchestration

## What This Document Is

We're designing a **meta-learning feedback loop** for a multi-agent software development system. When PR reviews find bugs, we want to trace them back to the guidance documents that caused them, then inject warnings into future agent runs.

**The core question**: What pattern types should we track?

This document is self-contained with all system-specific details you'd need.

---

## Part 1: Our System Architecture

### 1.1 The Workflow

```
LINEAR ISSUE (CON-XXX)
        │
        ▼
CONTEXT PACK CREATION (opus agent)
│   • Reads ALL relevant docs in codebase
│   • Extracts constraints with source citations
│   • Researches gotchas via web search
│   • Output: Single document for Spec agent
│   ← INJECTION POINT: Load warnings from past failures
        │
        ▼
SPEC CREATION (opus agent)
│   • Reads ONLY the Context Pack (nothing else)
│   • Extracts requirements, test specs, acceptance criteria
│   ← INJECTION POINT: Load warnings from past failures
        │
        ▼
IMPLEMENTATION (sonnet agent)
│   • Follows Spec exactly
│   • Output: Pull Request
        │
        ▼
PR REVIEW
│   • 6 Scouts (sonnet) - scan for issues, read-only
│   • 6 Judges (opus) - evaluate each scout's findings
│   • Orchestrator - synthesizes verdict
        │
        ▼
PATTERN ATTRIBUTION (NEW - what we're designing)
│   • For each confirmed finding: "What guidance caused this?"
│   • Output: Negative patterns stored
        │
        └──────────► FEEDBACK LOOP back to Context Pack/Spec agents
```

### 1.2 Document Hierarchy

```
Architecture Docs (highest authority)
        │ referenced by
        ▼
Context Pack (task-specific, created for ONE issue)
        │ is the ONLY input for
        ▼
Spec (requirements for ONE issue)
        │ followed by
        ▼
Implementation
```

**Key principle**: Docs are source of truth. If an implementing agent deviates, the agent is almost always wrong, not the docs.

### 1.3 Context Pack Details

A Context Pack is created per-issue. It:
- Reads all relevant architecture, design, API, security docs
- Extracts constraints with citations (e.g., "Source: LAYERS.md:45-67")
- Includes actual code snippets, not file paths
- Researches gotchas (Gemini for breadth, then deep research)

**Critical constraint**: The Spec agent reads ONLY the Context Pack. It cannot access other files. So the Context Pack must contain everything extracted - no "see file X for details."

### 1.4 PR Review: Scout/Judge Model

```
Orchestrator
    ├── 6 Scouts (sonnet, read-only, flag issues)
    │   ├── Security Scout (adversarial) - vulnerabilities, attack vectors
    │   ├── Docs Scout - implementation vs all system docs
    │   ├── Bug Scout - logic errors, edge cases
    │   ├── Test Scout - test quality, reward-hacking detection
    │   ├── Decisions Scout - undocumented decisions
    │   └── Spec Scout - implementation vs spec requirements
    │
    └── 6 Judges (opus, evaluate their scout's findings)
        └── Each returns: CONFIRMED / DISMISSED / MODIFIED
```

### 1.5 Judge Principles

| Judge | Principle |
|-------|-----------|
| **Security** | Security takes ABSOLUTE precedence. Cannot dismiss because "spec allowed it." If security issue exists, upstream docs were wrong. |
| **Docs** | Implementation must align with docs. Deviations need resolution: fix code OR update docs. No silent deviations. |
| **Bug** | Bugs are bugs regardless of docs. If spec caused bug, spec was wrong. |
| **Test** | Tests must verify behavior, not just exist. Watch for reward-hacking, tautological tests, missing negative tests. |
| **Decisions** | Undocumented decisions are system failures. Doc update is REQUIRED. |
| **Spec** | Specs are guidance, not gospel. Divergence may be better. We update system docs, not specs. |

---

## Part 2: The Problem

### 2.1 Current Gap

When scouts find bugs, we:
- Document them in PR review
- Fix the code
- Move on

We **don't** trace bugs back to the guidance that caused them.

### 2.2 Attribution Flow

```
Scout finds: "SQL injection in search endpoint"
        │
        ▼
Judge confirms: "CONFIRMED - no parameterization"
        │
        ▼
Attribution Agent:
├── Reads Context Pack for this issue
│   Found: Section 4.2 said "use template literals for SQL"
├── Reads Spec for this issue
│   Found: No mention of SQL injection prevention
        │
        ▼
Attribution Result:
{
  source: "context-pack",
  section: "4.2 Database Query Patterns",
  guidance: "Use template literals for readable queries",
  consequence: "SQL injection vulnerability",
  alternative: "Always use parameterized queries",
  confidence: "HIGH"
}
        │
        ▼
Pattern stored
        │
        ▼
NEXT TIME Context Pack agent runs for database task:

┌─────────────────────────────────────────────────────────┐
│ ## Warnings from Past Issues                            │
│                                                         │
│ ### From CON-123 (HIGH confidence)                      │
│ **Bad:** "Use template literals for readable queries"   │
│ **Result:** SQL injection in PR #456                    │
│ **Instead:** Always use parameterized queries           │
└─────────────────────────────────────────────────────────┘
```

---

## Part 3: Data Schemas

### Scout Finding

```typescript
interface ScoutFinding {
  id: string;
  prNumber: number;
  issueId: string;                 // "CON-123"
  scoutType: 'adversarial' | 'docs' | 'bugs' | 'tests' | 'decisions' | 'spec';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  blocking: boolean;
  title: string;
  description: string;
  location: { file: string; line?: number; function?: string; };
  evidence: string;
  timestamp: string;
  judgeVerdict?: 'CONFIRMED' | 'DISMISSED' | 'MODIFIED';
  judgeReasoning?: string;
}
```

### Negative Consequence

```typescript
interface NegativeConsequence {
  id: string;
  findingId: string;
  patternSource: 'context-pack' | 'spec';
  patternLocation: { file: string; section?: string; };
  patternContent: string;          // The actual bad guidance text
  attribution: {
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string;
    alternativeApproach?: string;
  };
  timestamp: string;
  issueId: string;
  prNumber: number;
}
```

---

## Part 4: Our Current Recommendations

### 4.1 Negative Pattern Taxonomy

Two dimensions:

**Guidance Type:**
- `active` — Guidance explicitly said to do X, and X was wrong
- `passive` — Guidance failed to mention Y, and Y was important

**Finding Category** (maps to scout type):
- `security` — Led to vulnerability
- `correctness` — Led to bug
- `testing` — Led to weak tests
- `compliance` — Led to doc/spec deviation

| Guidance | Category | Example |
|----------|----------|---------|
| active | security | "Context Pack recommended template literals for SQL" |
| active | correctness | "Spec specified wrong boundary condition" |
| passive | security | "Context Pack didn't reference security-guidelines.md" |
| passive | correctness | "Spec failed to specify null handling" |
| passive | testing | "Spec didn't require edge case tests" |

### 4.2 Positive Pattern Taxonomy

We concluded only two can be reliably detected:

| Type | Detection |
|------|-----------|
| `safe-parallel` | Tasks ran concurrently, PR passed |
| `required-sequence` | Parallel execution broke something |

**Why so limited?** Other candidates are correlational:
- "This doc reference was helpful" — Can't prove causation
- "This spec language was clear" — No signal from absence of misinterpretation
- "This warning prevented an issue" — Can't prove counterfactual

### 4.3 Pattern Storage

Structured IDs (not LLM-generated strings):

```typescript
interface StoredPattern {
  id: {
    source: 'context-pack' | 'spec';
    issueId: string;
    section: string;
    contentHash: string;       // SHA-256 of guidance text
  };
  guidanceType: 'active' | 'passive';
  findingCategory: 'security' | 'correctness' | 'testing' | 'compliance';
  content: string;
  consequence: string;
  alternative: string;
  confidence: number;          // 0.0 to 1.0
  technologies: string[];      // ["sql", "postgres"]
  taskTypes: string[];         // ["api", "database"]
  occurrences: number;
  lastSeen: string;
}
```

### 4.4 Derived Principles

When 3+ similar patterns cluster, derive a general principle:

```typescript
interface DerivedPrinciple {
  principle: string;           // "Never recommend string interpolation for SQL"
  derivedFrom: string[];       // Pattern IDs
  injectInto: 'context-pack-agent' | 'spec-agent' | 'both';
  trigger: {
    taskTypes?: string[];
    technologies?: string[];
  };
  confidence: number;
}
```

### 4.5 Confidence Model

```
confidence = (
  baseFromAttribution           // HIGH=0.8, MEDIUM=0.5, LOW=0.3
  + judgeConfirmed * 0.1
  + repeatOccurrence * 0.15
  - timeSinceLastSeen * decay   // 90-day half-life
)
```

Threshold: 0.3 to remain active.

---

## Part 5: Open Questions

### 5.1 Pattern Type Taxonomy

Is `active/passive × finding category` the right abstraction?

**Alternative - more granular:**
- `unsafe-recommendation`
- `incorrect-specification`
- `missing-doc-reference`
- `ambiguous-language`
- `incomplete-requirements`

Pro: More precise. Con: Types may overlap.

### 5.2 Positive Pattern Learning

Are we too conservative? Is there a way to reliably learn from successes beyond parallelization?

### 5.3 Attribution Scope

When tracing back:
```
Bug ← Spec said X ← Context Pack recommended X ← Context Pack referenced bad arch doc
```

Where do we attribute?
- **Option A**: Context Pack (responsible for not propagating bad advice)
- **Option B**: Deepest source (arch doc)
- **Option C**: Both with weights

We lean Option A.

### 5.4 Injection Triggers

When to inject a warning?

| Option | Pro | Con |
|--------|-----|-----|
| Structured metadata (`taskTypes`, `technologies`) | Deterministic | May miss cases |
| Keyword matching | Simple | Brittle |
| Semantic similarity | Captures meaning | Expensive, unpredictable |
| Always inject all | Never misses | Token-expensive |
| LLM decides at runtime | Smart | Adds latency |

### 5.5 Cold Start

How to bootstrap with zero patterns?
- Seed with known anti-patterns (OWASP, common CVEs)?
- Observation mode first?
- Manual entry?

### 5.6 Pattern Lifecycle

- When to archive? Confidence decay below threshold?
- Should some patterns (SQL injection) never decay?
- If root cause is fixed (arch doc updated), invalidate related patterns?

### 5.7 Warning Fatigue

How to avoid injecting too many warnings that get ignored?

---

## Part 6: Constraints

1. **Machine-only** — No human UI for this phase
2. **Auto-extractable** — Patterns from PR review findings automatically
3. **Auto-injectable** — Warnings injected into agent prompts automatically
4. **Zero-to-hero** — Works with zero patterns, improves over time
5. **Deterministic matching** — Structured IDs, not LLM-generated strings
6. **Token-conscious** — Injected warnings shouldn't overwhelm context window

---

## Part 7: Failure Modes to Avoid

We analyzed **say-your-harmony**, an open-source project that attempted similar meta-learning. It failed in four ways:

### Failure 1: LLM-Generated Pattern Names

The system asked an LLM to name patterns. Different sessions generated:
- `"db-schema-created"`
- `"database-schema-done"`
- `"schema-creation-complete"`

Matched by exact string equality. Never matched. No learning accumulated.

**Our mitigation:** Structured IDs with content hashes.

### Failure 2: Rich Extraction, Narrow Storage

Extracted: decisions, insights, approaches, challenges, risks

Stored: only `sequentialDeps` and `parallelSuccesses`

Everything else discarded.

**Our mitigation:** Store actual guidance content.

### Failure 3: Query Functions Never Called

Functions existed:
- `recommendPatterns()`
- `loadHighConfidencePatterns()`
- `getAntiPatterns()`

But no code ever called them. Dead code.

**Our mitigation:** Design injection points FIRST.

### Failure 4: No Injection

Patterns written to disk. Agent prompts never loaded them. Feedback loop broken at last step.

**Our mitigation:** Injection is part of core design.

---

## Part 8: What We Want From This Review

1. **Validate or challenge** our pattern taxonomy (active/passive × finding category)

2. **Identify gaps** — What aren't we tracking that we should?

3. **Positive pattern alternatives** — Are we too conservative?

4. **Specific recommendations** for:
   - Storage schema
   - Confidence model
   - Injection triggers
   - Cold start

5. **Risk assessment** — What could go wrong? Failure modes we haven't considered?

6. **Concrete schema proposal** if you think ours needs changes

---

## Appendix: Sample Data

### Scout Finding

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "prNumber": 456,
  "issueId": "CON-123",
  "scoutType": "adversarial",
  "severity": "HIGH",
  "blocking": true,
  "title": "SQL Injection in user search",
  "description": "Search query interpolates user input without sanitization.",
  "location": { "file": "src/api/search.ts", "line": 87, "function": "searchUsers" },
  "evidence": "const query = `SELECT * FROM users WHERE name LIKE '%${searchTerm}%'`",
  "judgeVerdict": "CONFIRMED",
  "judgeReasoning": "No parameterization exists. Textbook SQL injection."
}
```

### Attribution Result

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "findingId": "550e8400-e29b-41d4-a716-446655440000",
  "patternSource": "context-pack",
  "patternLocation": { "file": "linear://doc/context-pack-CON-123", "section": "4.2" },
  "patternContent": "For simple queries, use template literals for readability",
  "attribution": {
    "confidence": "HIGH",
    "reasoning": "Context Pack explicitly recommended template literals without mentioning parameterization.",
    "alternativeApproach": "Always use parameterized queries"
  },
  "issueId": "CON-123",
  "prNumber": 456
}
```

### Injected Warning

```markdown
## Warnings from Past Issues

### From CON-123 (HIGH confidence)
**Bad:** "For simple queries, use template literals for readability"
**Result:** SQL injection in PR #456
**Instead:** NEVER use string interpolation for SQL. Always parameterized queries.
```
