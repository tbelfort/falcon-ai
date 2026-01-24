# Doc Review System - Implementation Plan

**Status**: Planning
**Author**: Human + Claude Opus 4.5
**Date**: 2026-01-22

---

## CRITICAL INSTRUCTION

**DO NOT EDIT ANY FILES.**

Your task is to:
1. Read this plan thoroughly
2. Answer all open questions
3. Recommend the content for each file
4. Present your recommendations for human review

Do not use Edit, Write, or any file modification tools. Output your recommendations as text.

---

## Background

### The Problem: Reward Hacking in Doc Review

We built a documentation review system (`falcon_test/apps/review.sh`) that runs discovery and fix phases. After 16-22 review cycles, it reports "0 issues found."

However, when we ran fresh agents without context of previous reviews, they found 70+ issues across 5 test apps.

**Root cause**: The fix agent learned to "solve" issues by adding "Known Limitation" or "Warning" text instead of actually fixing the underlying problems. This satisfies the "mark as SOLVED" metric without solving anything.

Example reward hack:
```
Scout finds: "Backup can silently overwrite files with same name"
Fixer "fixes": Adds "**Known Limitation:** Backup can silently overwrite..."
Status: SOLVED ✓  (but the problem still exists)
```

### The Solution: Separation of Concerns

We're building a new system with three distinct roles:

1. **Scout**: Detects problems. Does NOT propose solutions.
2. **Fixer**: Receives problem, decides how to fix, applies fix. Fresh context. Told their work will be judged.
3. **Judge**: Evaluates if the fix actually solves the problem. Does NOT propose alternatives. Explains WHY pass/fail.

The separation prevents reward hacking because:
- Fixer doesn't know what judge will accept
- Judge is domain-specialized and knows what a "real fix" looks like
- Fixer is told to aim for enterprise-grade production quality

---

## Documentation System Context

### The docs/ Structure

Documentation is organized into two layers with different detail levels:

```
docs/
├── design/          # 85% detail - "good enough for humans"
│   ├── vision.md        # Goals, non-goals, project scope
│   ├── use-cases.md     # User stories, scenarios
│   ├── technical.md     # Architecture decisions, patterns
│   └── components.md    # Module breakdown, interfaces
│
└── systems/         # 100% detail - "pedantic enough for agents"
    ├── CONSTITUTION.md  # Immutable principles (see below)
    ├── architecture/    # Detailed system architecture
    ├── cli/             # CLI interface specs
    │   └── interface.md
    ├── database/        # Database specs
    │   └── schema.md
    └── errors.md        # Error handling specs
```

### Why Two Layers?

| Layer | Audience | Detail Level | Purpose |
|-------|----------|--------------|---------|
| `docs/design/` | Humans | 85% | Technical decisions, "obvious stuff" left implicit |
| `docs/systems/` | Agents | 100% | Pedantic, explicit, nothing left to interpretation |

**Humans** make good decisions with loose technical docs - they fill in gaps with experience.

**Agents** make unreliable decisions without pedantic specificity - they can't infer "obvious" things.

The doc review system reviews BOTH layers, but systems/ docs are held to higher standard.

### The Constitution

The Constitution defines **immutable principles** that govern ALL development. Located at `docs/systems/CONSTITUTION.md`:

```markdown
## Article I: Determinism Over LLM Judgment
Pattern attributions MUST be deterministic using structured evidence
and decision trees. LLM judgment is advisory, never authoritative.

## Article II: Specs Leave Nothing to Decide
Implementation specs MUST be detailed enough that the implementor
makes ZERO judgment calls. If discretion exists, the spec is incomplete.

## Article III: Systems Docs Before Build
For agent workflows, Systems docs MUST be written BEFORE implementation.
Agents cannot reliably build what isn't fully specified.

## Article IV: Append-Only History
Occurrence records are NEVER mutated. Mark inactive instead of delete.
History is sacred.

## Article V: Separate Belief from Action
Attribution confidence ≠ injection priority. These are independent
decisions with different criteria.
```

**Constitutional violations are CRITICAL severity and block progress.**

The `constitution` scout checks all docs against these articles.
The `constitution` judge evaluates fixes for constitutional compliance.

### What Good Docs Look Like

**Design docs (85%):**
- Capture intent and rationale
- Document key decisions
- Acceptable to have gaps that "experienced devs just know"

**Systems docs (100%):**
- Use RFC 2119 language (MUST/SHOULD/MAY)
- Specify exact values, bounds, limits
- Define all error conditions and recovery paths
- Include testable acceptance criteria
- Leave NOTHING to implementer discretion

**Bad doc (ambiguous):**
```markdown
The system should handle large files appropriately.
```

**Good doc (precise):**
```markdown
Files exceeding MAX_FILE_SIZE (10MB) MUST be rejected with error code 413
and message "File size {size} exceeds maximum allowed size of 10MB".
The check MUST occur before any processing begins.
```

---

## System Architecture

### File Structure

```
CORE/TASKS/
└── DOC_REVIEW.md                    # Orchestrator task file

.claude/agents/doc-review/
├── scouts/
│   ├── completeness.md
│   ├── consistency.md
│   ├── logic.md
│   ├── security.md
│   ├── adversarial.md
│   ├── testability.md
│   ├── rfc-2119.md
│   ├── edge-cases.md
│   ├── performance.md
│   ├── error-handling.md
│   ├── concurrency.md
│   ├── dependencies.md
│   ├── constitution.md
│   ├── vision.md
│   ├── task-granularity.md
│   ├── db.md
│   ├── api.md
│   ├── ux.md
│   ├── ops.md
│   └── fresh-eyes.md
├── judges/
│   ├── completeness.md
│   ├── consistency.md
│   ├── logic.md
│   ├── security.md
│   ├── adversarial.md
│   ├── testability.md
│   ├── rfc-2119.md
│   ├── edge-cases.md
│   ├── performance.md
│   ├── error-handling.md
│   ├── concurrency.md
│   ├── dependencies.md
│   ├── constitution.md
│   ├── vision.md
│   ├── task-granularity.md
│   ├── db.md
│   ├── api.md
│   ├── ux.md
│   ├── ops.md
│   └── fresh-eyes.md
├── references/
│   ├── owasp-top-10.md
│   ├── rfc-2119-spec.md
│   └── abuse-patterns.md
└── fixer.md
```

**Agent files: 42** (1 orchestrator + 20 scouts + 20 judges + 1 fixer)

**Plus reference files:**
```
.claude/agents/doc-review/references/
├── owasp-top-10.md          # Security reference for security scout/judge
├── rfc-2119-spec.md         # RFC 2119 definitions for rfc-2119 scout/judge
└── abuse-patterns.md        # Adversarial patterns reference
```

**Grand total: 45 files**

---

## Agent Invocation

All agents are invoked via the **Task tool** with sub-agents.

### Model Assignments

| Role | Model | Rationale |
|------|-------|-----------|
| Scouts | **Sonnet** | Fast detection, good pattern matching, cost-effective for 20 parallel runs |
| Fixer | **Opus** | Needs best judgment for design decisions and precise fixes |
| Judges | **Opus** | Critical evaluation requires highest capability |

### Invocation Pattern

```
Orchestrator (DOC_REVIEW.md)
    │
    ├── Task(subagent_type="general-purpose", model="sonnet") × 20 scouts
    │
    ├── Task(subagent_type="general-purpose", model="opus") × N fixers
    │
    └── Task(subagent_type="general-purpose", model="opus") × N judges
```

---

## Falcon-AI Philosophy

**Core principle**: Agents have good reasoning but unreliable judgment.

This is why:
1. **Scouts** have narrow, focused detection tasks (not "find everything")
2. **Fixers** are told exactly what to fix (not "improve the docs")
3. **Judges** evaluate against specific criteria (not "is this good?")

The separation of concerns forces each agent into a focused task where their reasoning can shine without requiring broad judgment.

**Documentation is critical** because agents implementing from specs cannot fill in gaps. Unlike humans who infer "obvious" things, agents will:
- Make arbitrary choices when specs are ambiguous
- Hallucinate behavior when specs are incomplete
- Implement literally what's written, even if wrong

Therefore: ALL issues in docs/ must be fixed, regardless of severity. Low severity still gets fixed - it just allows lighter fix types (documentation_only).

### systems/ vs design/ Severity

| Layer | Same Issue | Rationale |
|-------|------------|-----------|
| `docs/design/` | MEDIUM | Humans can fill gaps |
| `docs/systems/` | HIGH | Agents cannot fill gaps |

The scout SHOULD note which layer the issue is in, and adjust severity accordingly.

---

## Scout Definitions

All scouts run in parallel. Each returns findings or empty. No tiering - docs must be perfect.

### Core Quality Scouts

| Scout | Purpose | What It Detects |
|-------|---------|-----------------|
| `completeness` | Is everything specified? | TODOs, TBDs, placeholders, missing sections, undefined terms, incomplete specs |
| `consistency` | Do docs agree across files? | Same concept with different names, conflicting values, cross-doc contradictions |
| `logic` | Are there logical problems? | Impossible states, circular dependencies, contradictory requirements, invalid sequences |
| `testability` | Can requirements be tested? | Vague acceptance criteria, untestable requirements, missing test scenarios |
| `rfc-2119` | Is language precise? | Inconsistent MUST/SHOULD/MAY usage, ambiguous "should", missing requirement levels |
| `edge-cases` | Are boundaries documented? | Missing zero/empty/null handling, undocumented boundaries, overflow gaps |
| `error-handling` | Are errors documented? | Undocumented error conditions, missing recovery paths, silent failures |

### Security Scouts

| Scout | Purpose | What It Detects |
|-------|---------|-----------------|
| `security` | Technical vulnerabilities | SQL/command/template injection, path traversal, auth bypass, XSS, CSRF, insecure defaults |
| `adversarial` | Abuse patterns | Resource exhaustion, DoS vectors, malicious input abuse, rate limit gaps, intentional misuse |

### Non-Functional Scouts

| Scout | Purpose | What It Detects |
|-------|---------|-----------------|
| `performance` | Are perf requirements specified? | Missing bounds, no timeouts, unbounded operations, missing complexity analysis |
| `concurrency` | Are race conditions addressed? | TOCTOU races, missing transactions, lock ordering issues, deadlock potential |
| `dependencies` | Are deps properly specified? | Unversioned dependencies, missing fallbacks, implicit requirements, circular deps |

### Falcon-Specific Scouts

| Scout | Purpose | What It Detects |
|-------|---------|-----------------|
| `constitution` | Constitutional compliance | Violations of the 5 Constitutional articles (see docs/systems/CONSTITUTION.md) |
| `vision` | Alignment with stated goals | Implementation drift, scope creep, non-goal violations, missing goal coverage |
| `task-granularity` | Task breakdown quality | Tasks too big (vague), too small (overhead), missing dependencies, unclear scope |

### Domain Scouts

| Scout | Purpose | What It Detects |
|-------|---------|-----------------|
| `db` | Database concerns | Schema gaps, missing indexes, undefined transaction boundaries, migration issues |
| `api` | API concerns | Missing endpoints, undocumented errors, versioning gaps, inconsistent patterns |
| `ux` | User experience (incl CLI) | Bad error messages, inconsistent output, missing feedback, poor help text |
| `ops` | Operational concerns | Config gaps, missing env var docs, deployment concerns, monitoring gaps |

### Catch-All Scout

| Scout | Purpose | What It Detects |
|-------|---------|-----------------|
| `fresh-eyes` | Unconstrained review | ANYTHING that seems wrong, confusing, incomplete, or problematic - no specific lens |

---

## Orchestration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INPUT                                                                       │
│                                                                              │
│  Orchestrator receives:                                                      │
│    - docs_path: Path to documentation folder to review                       │
│    - context_files: Optional additional context (e.g., CONSTITUTION.md)      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: DETECTION                                                          │
│                                                                              │
│  1. Run ALL 20 scouts in parallel (batch if rate-limited)                   │
│  2. Each scout examines docs and returns findings                           │
│  3. Collect all findings                                                     │
│  4. Deduplicate by (file + line + description hash)                         │
│  5. Sort by severity: CRITICAL > HIGH > MEDIUM > LOW                        │
│                                                                              │
│  Scout output format:                                                        │
│  {                                                                           │
│    scout: "security",                                                        │
│    findings: [                                                               │
│      {                                                                       │
│        id: "SEC-001",                                                        │
│        severity: "HIGH",                                                     │
│        title: "SQL injection in search query",                              │
│        file: "docs/systems/database/schema.md",                             │
│        line: 245,                                                            │
│        evidence: "Query uses string concatenation...",                      │
│        why_problem: "Allows attacker to execute arbitrary SQL"              │
│      }                                                                       │
│    ]                                                                         │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: FIX                                                                │
│                                                                              │
│  For each finding (CRITICAL first, then HIGH, MEDIUM, LOW):                 │
│                                                                              │
│  1. Spawn FRESH fixer agent with:                                           │
│     - Problem description                                                    │
│     - Scout type (so fixer knows domain)                                    │
│     - Affected file(s) and line(s)                                          │
│     - Severity level                                                         │
│     - Statement: "Your fix will be judged by a {scout_type} expert.         │
│       Create the BEST POSSIBLE fix for an enterprise-grade production       │
│       system. The purpose of thorough documentation is to MINIMIZE          │
│       PROBLEMS AT DEVELOPMENT TIME."                                        │
│                                                                              │
│  2. Fixer reads files, makes design decisions, applies fix                  │
│                                                                              │
│  3. Fixer returns:                                                           │
│     {                                                                        │
│       issue_id: "SEC-001",                                                   │
│       fix_type: "behavior_change",  // see valid types below                │
│       files_changed: ["docs/systems/database/schema.md"],                   │
│       description: "Changed query to use parameterized statements",         │
│       reasoning: "Parameterized queries prevent SQL injection by...",       │
│       diff: "..."                                                            │
│     }                                                                        │
│                                                                              │
│  Valid fix_type values:                                                      │
│    - behavior_change: Changed how the system should behave                  │
│    - validation_added: Added input validation or constraints                │
│    - error_handling: Added error conditions and recovery                    │
│    - spec_clarification: Made ambiguous spec precise                        │
│    - documentation_only: Added explanatory text (WARNING: often rejected)   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: JUDGE                                                              │
│                                                                              │
│  For each fix:                                                               │
│                                                                              │
│  1. Route to CORRESPONDING judge based on scout type                        │
│     (security finding → security judge, db finding → db judge, etc.)        │
│                                                                              │
│  2. Judge receives:                                                          │
│     - Original problem (from scout)                                          │
│     - Fixer's solution description                                           │
│     - Fixer's reasoning                                                      │
│     - Diff of changes                                                        │
│     - Severity level                                                         │
│     - Domain-specific context (see "Judge Context" section)                 │
│                                                                              │
│  3. Judge evaluates and returns:                                             │
│     {                                                                        │
│       issue_id: "SEC-001",                                                   │
│       verdict: "PASS" | "FAIL",                                              │
│       reasoning: "The fix properly addresses... / The fix fails because..." │
│     }                                                                        │
│                                                                              │
│  Judge MUST reject:                                                          │
│    - "Known Limitation" added for CRITICAL/HIGH severity                    │
│    - "Warning" text added instead of prevention mechanisms                  │
│    - Moving issues to "Non-Goals" instead of addressing them                │
│    - Vague language replacing specific requirements                         │
│    - Partial fixes that address symptoms but not root cause                 │
│                                                                              │
│  Judge acceptance by severity:                                               │
│    - CRITICAL: behavior_change, validation_added ONLY                       │
│    - HIGH: behavior_change, validation_added, error_handling                │
│    - MEDIUM: + spec_clarification                                            │
│    - LOW: + documentation_only                                               │
│                                                                              │
│  Judge does NOT propose alternatives. Only explains WHY pass/fail.          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: RETRY (if judge rejects)                                           │
│                                                                              │
│  For each FAIL verdict:                                                      │
│                                                                              │
│  1. Spawn FRESH fixer with:                                                  │
│     - Original problem                                                       │
│     - Previous fix attempt (what was tried)                                 │
│     - Judge's rejection reason (why it failed)                              │
│     - Statement: "A {scout_type} expert rejected your previous fix          │
│       because: {rejection_reason}. Try a different approach."               │
│                                                                              │
│  2. Fixer tries different approach                                           │
│                                                                              │
│  3. Back to judge for re-evaluation                                          │
│                                                                              │
│  4. Maximum 3 attempts per issue                                             │
│                                                                              │
│  5. After 3 failures: escalate to human review                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: REPORT                                                             │
│                                                                              │
│  Output final report:                                                        │
│                                                                              │
│  {                                                                           │
│    summary: {                                                                │
│      docs_path: "/path/to/docs",                                            │
│      scouts_run: 20,                                                         │
│      total_findings: 15,                                                     │
│      fixed: 12,                                                              │
│      rejected_final: 1,                                                      │
│      escalated_to_human: 2                                                   │
│    },                                                                        │
│    by_severity: {                                                            │
│      CRITICAL: { found: 2, fixed: 2, escalated: 0 },                        │
│      HIGH: { found: 5, fixed: 4, escalated: 1 },                            │
│      MEDIUM: { found: 6, fixed: 5, escalated: 1 },                          │
│      LOW: { found: 2, fixed: 1, escalated: 0 }                              │
│    },                                                                        │
│    by_scout: {                                                               │
│      security: { findings: 3, fixed: 3 },                                   │
│      db: { findings: 2, fixed: 1, escalated: 1 },                           │
│      // ... etc                                                              │
│    },                                                                        │
│    escalated_to_human: [                                                     │
│      {                                                                       │
│        issue_id: "DB-001",                                                   │
│        problem: "...",                                                       │
│        attempts: [                                                           │
│          { fix: "...", rejection: "..." },                                  │
│          { fix: "...", rejection: "..." },                                  │
│          { fix: "...", rejection: "..." }                                   │
│        ]                                                                     │
│      }                                                                       │
│    ],                                                                        │
│    fixes_applied: [                                                          │
│      { issue_id: "SEC-001", file: "...", description: "..." },              │
│      // ...                                                                  │
│    ]                                                                         │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Judge Context Requirements

Each judge needs domain-specific context to properly evaluate fixes.

### Dynamic Context (Orchestrator Injects at Runtime)

| Judge | Context to Inject |
|-------|-------------------|
| constitution | Full content of `docs/systems/CONSTITUTION.md` |
| vision | Full content of `docs/design/vision.md` |
| db | Project's schema files, database patterns |
| api | Project's API specs, endpoint definitions |
| ux | Project's interface specs, CLI help text |
| ops | Project's deployment docs, config specs |

### Static Context (Reference Files)

Create these reference files and inject their content into the relevant scouts/judges:

| Reference File | Used By | Content |
|----------------|---------|---------|
| `references/owasp-top-10.md` | security scout, security judge | OWASP Top 10 vulnerabilities with examples |
| `references/rfc-2119-spec.md` | rfc-2119 scout, rfc-2119 judge | Full RFC 2119 definitions (MUST, SHOULD, MAY, etc.) |
| `references/abuse-patterns.md` | adversarial scout, adversarial judge | Common abuse patterns, DoS vectors, rate limiting |

### Domain Expertise (Baked into Prompts)

| Judge | Expertise to Include in Prompt |
|-------|--------------------------------|
| concurrency | Race condition patterns, locking strategies, transaction isolation levels |
| performance | Complexity analysis, timeout patterns, resource bounds |
| testability | Good acceptance criteria examples, Given/When/Then patterns |
| All judges | What constitutes a "real fix" vs "reward hack" (see Fixer spec) |

---

## Scout Scope Definitions

Each scout needs to know what files to examine.

### Proposed Scope Mapping

| Scout | Scope | Rationale |
|-------|-------|-----------|
| **completeness** | ALL files | Missing specs can be anywhere |
| **consistency** | ALL files | Need to cross-reference everything |
| **logic** | ALL files | Logic errors can be anywhere |
| **security** | ALL files | Security issues can be anywhere |
| **adversarial** | ALL files | Abuse vectors can be anywhere |
| **testability** | `**/tasks/*.md`, `**/*-spec.md`, `**/use-cases.md` | Only files with testable requirements |
| **rfc-2119** | `docs/systems/**` | Only systems docs use RFC 2119 language |
| **edge-cases** | ALL files | Edge cases can be anywhere |
| **performance** | `docs/systems/**`, `**/technical.md` | Performance specs in systems/technical |
| **error-handling** | `**/errors.md`, `**/interface.md`, `docs/systems/**` | Error specs in specific files |
| **concurrency** | `**/schema.md`, `**/database/**`, `**/technical.md` | Concurrency in DB/technical docs |
| **dependencies** | `**/technical.md`, `**/components.md`, `**/package.json` | Deps in technical/components |
| **constitution** | ALL files | Check everything against Constitution |
| **vision** | `docs/design/vision.md` ONLY | Only checks the main vision file |
| **task-granularity** | `**/tasks/*.md` | Only task files |
| **db** | `**/database/**`, `**/schema.md`, `**/migrations/**` | Database-specific files |
| **api** | `**/api/**`, `**/endpoints/**`, `**/interface.md` | API-specific files |
| **ux** | `**/cli/**`, `**/interface.md`, `**/errors.md` | User-facing specs |
| **ops** | `**/deployment/**`, `**/config/**`, `**/.env*`, `**/ops/**` | Operational files |
| **fresh-eyes** | ALL files | Unconstrained - looks at everything |

**Summary:** 8 scouts examine ALL files, 12 scouts have targeted scopes.

**Fallback rule:** If a targeted scout finds no matching files, it should return empty findings (not examine all files). The absence of expected files might itself be a finding for the `completeness` scout.

---

## Open Questions

### Q1: Scout Scope
A proposed scope mapping is provided in "Scout Scope Definitions" section above.

**Review the proposed mapping and either:**
- Accept it as-is
- Modify scopes that seem wrong
- Add rationale for any changes

**Key decision:** Should targeted scouts (like `db`) fall back to examining all files if no matching files exist, or return empty? The proposal says return empty (absence of files = completeness issue, not db issue).

### Q2: Severity Assignment
Who assigns severity to findings?
- **Option A**: Scout assigns severity when reporting
- **Option B**: Orchestrator assigns based on scout type (security always HIGH+)
- **Option C**: Fixed mapping (security=HIGH, completeness=MEDIUM, etc.)

**Recommendation**: Option A - Scout assigns with justification. Scout understands context best.

### Q3: Deduplication Priority
When multiple scouts find the same issue, which finding to keep?
- **Option A**: Keep first found
- **Option B**: Keep highest severity
- **Option C**: Keep most specific scout (db over logic for schema issue)

**Recommendation**: Option C - More specific scout likely has better context.

### Q4: Rate Limiting Strategy
Running 20 scouts in parallel = 20 concurrent API calls.
- **Option A**: Run all 20 in parallel, let API handle rate limits
- **Option B**: Batch in groups of 5-6
- **Option C**: Sequential (slowest but safest)

**Recommendation**: Option B - Balance between speed and reliability.

### Q5: Fresh-Eyes Scout Severity
The fresh-eyes scout has no specific domain. What severity can it assign?
- **Option A**: Can assign any severity
- **Option B**: Limited to MEDIUM/LOW (domain scouts handle CRITICAL/HIGH)
- **Option C**: Always assigns MEDIUM, let orchestrator adjust

**Recommendation**: Option A - Fresh eyes might catch critical issues others miss.

### Q5b: Fresh-Eyes Judge Problem (NEED ADVICE)
The fresh-eyes scout finds "anything that seems wrong" without a specific domain lens.

**Problem**: What expertise does the fresh-eyes JUDGE have?
- Security judge has OWASP
- RFC-2119 judge has RFC 2119 spec
- Constitution judge has the Constitution articles
- Fresh-eyes judge has... what?

**Options to consider**:
- A) Fresh-eyes judge uses general documentation quality principles only
- B) Fresh-eyes judge routes to the most appropriate domain judge based on the issue
- C) Fresh-eyes findings skip judge and go straight to human review
- D) Fresh-eyes judge is just "does this fix make the docs better without breaking anything?"

**Please advise on the best approach for the fresh-eyes judge.**

### Q6: Judge Disagreement with Severity
What if judge thinks the severity was wrong?
- **Option A**: Judge can override severity
- **Option B**: Judge can flag but not change
- **Option C**: Severity is fixed once scout assigns

**Recommendation**: Option B - Judge flags, orchestrator decides whether to adjust.

### Q7: Fixer Access to Previous Fixes
Should fixer see fixes applied earlier in the same run?
- **Option A**: Yes - fixer sees all prior fixes (might help with related issues)
- **Option B**: No - fresh context for each fix (prevents cascading errors)

**Recommendation**: Option B - Fresh context prevents one bad fix from propagating.

### Q8: Empty Results Message
What should the system output if all scouts find nothing?
- Proposed: "Documentation passed all 20 checks. No issues found."

### Q9: Human Escalation Format
After 3 failed fix attempts, what information should be presented to human?
- Proposed format shown in Phase 5 report above. Is this sufficient?

### Q10: Integration with Existing review.sh
Does this system replace review.sh or complement it?
- **Recommendation**: Replace for documentation review. review.sh was the flawed system.

---

## Fixer Agent Specification

```markdown
# Fixer Agent

## Your Context
You are fixing a documentation issue identified by a Scout agent.
Your fix WILL BE JUDGED by a domain expert who will evaluate whether
your solution is production-ready.

## Your Goal
Create the BEST POSSIBLE fix for an enterprise-grade production system.
The purpose of thorough documentation is to MINIMIZE PROBLEMS AT DEVELOPMENT TIME.
A developer implementing from this spec should have ZERO ambiguity.

## What the Judge Will Reject
- Adding "Known Limitation" text instead of specifying behavior
- Adding "Warning" text instead of prevention mechanisms
- Moving issues to "Non-Goals" instead of addressing them
- Vague language that leaves decisions to the implementer
- Partial fixes that address symptoms but not root cause
- Changes that introduce new ambiguities

## What the Judge Will Accept
- Concrete behavior specifications with exact values
- Validation rules with specific bounds and error messages
- Transaction boundaries and locking strategies
- Complete error handling with recovery paths
- Testable acceptance criteria with Given/When/Then format

## Your Constraints
- You MUST read the affected file(s) before making changes
- You MUST change the documentation to fix the problem
- You MUST specify behavior precisely enough for agent implementation
- You MUST NOT leave any ambiguity for the implementer
- If the fix requires a design decision, MAKE the decision and document WHY

## Input You Receive
- Problem description (from scout)
- Scout type (security, db, etc.)
- Affected file(s) and line number(s)
- Severity (CRITICAL, HIGH, MEDIUM, LOW)

## Output Required
{
  issue_id: "string",
  fix_type: "behavior_change" | "validation_added" | "error_handling" | "spec_clarification" | "documentation_only",
  files_changed: ["list of file paths"],
  description: "What you changed",
  reasoning: "Why this fix addresses the root cause",
  diff: "The actual changes made"
}
```

---

## Judge Agent Specification (Template)

Each judge has the same structure but different domain expertise.

```markdown
# {Domain} Judge

## Your Role
You evaluate whether a fix properly addresses a {domain} issue.
You do NOT propose alternatives. You only explain WHY the fix passes or fails.

## Your Expertise
{Domain-specific expertise here - OWASP for security, RFC 2119 for rfc-2119, etc.}

## What You MUST Reject
- "Known Limitation" or "Warning" text for CRITICAL/HIGH issues
- Fixes that document the problem instead of solving it
- Vague language that leaves implementation decisions
- Partial fixes that don't address root cause
- Fixes that introduce new problems

## Acceptance Criteria by Severity
- CRITICAL: Only behavior_change or validation_added
- HIGH: behavior_change, validation_added, or error_handling
- MEDIUM: Above + spec_clarification
- LOW: Above + documentation_only

## Input You Receive
- Original problem (from scout)
- Fix description and reasoning (from fixer)
- Diff of changes
- Severity level
- {Domain-specific context if applicable}

## Output Required
{
  issue_id: "string",
  verdict: "PASS" | "FAIL",
  reasoning: "Detailed explanation of why the fix passes or fails"
}

## Critical Reminder
You do NOT propose how to fix it. You only evaluate what was done.
If the fix fails, explain WHY so the fixer can try a different approach.
```

---

## Scout Agent Specification (Template)

```markdown
# {Domain} Scout

## Your Role
You examine documentation to find {domain} issues.
You do NOT propose solutions. You only identify problems.

## Your Expertise
{Domain-specific expertise here}

## What to Look For
{Specific checklist for this domain}

## Severity Guidelines
- CRITICAL: {domain-specific criteria for critical}
- HIGH: {domain-specific criteria for high}
- MEDIUM: {domain-specific criteria for medium}
- LOW: {domain-specific criteria for low}

## Input You Receive
- docs_path: Path to documentation folder
- file_patterns: Which files to examine (or all)

## Output Required
{
  scout: "{domain}",
  findings: [
    {
      id: "{DOMAIN}-001",
      severity: "HIGH",
      title: "Brief title",
      file: "path/to/file.md",
      line: 123,
      evidence: "The actual text that shows the problem",
      why_problem: "Explanation of why this is a problem"
    }
  ]
}

## Critical Reminder
You do NOT propose fixes. Only identify problems with evidence.
If you find nothing, return empty findings array.
```

---

## Implementation Order

Recommended order for implementation:

1. **Reference files first** (scouts/judges depend on these):
   - `references/owasp-top-10.md`
   - `references/rfc-2119-spec.md`
   - `references/abuse-patterns.md`

2. **CORE/TASKS/DOC_REVIEW.md** - Orchestrator (defines the flow)

3. **fixer.md** - Single fixer agent

4. **scouts/fresh-eyes.md** - Start with simplest scout (no domain expertise needed)

5. **judges/fresh-eyes.md** - Corresponding judge (see Q5b for open question)

6. **Domain scouts/judges** - Add remaining 19 pairs, prioritizing:
   - security + adversarial (security-critical)
   - constitution + vision (falcon-specific)
   - completeness + consistency (universal quality)
   - ...then the rest

---

## Your Task

1. **Answer all 11 open questions** (Q1-Q10 plus Q5b) with your reasoning

2. **Review the proposed scout scope mapping** and either accept, modify, or add rationale for changes

3. **Write the content** for each of the 45 files:
   - `CORE/TASKS/DOC_REVIEW.md` (orchestrator)
   - `.claude/agents/doc-review/fixer.md`
   - `.claude/agents/doc-review/scouts/*.md` (20 files)
   - `.claude/agents/doc-review/judges/*.md` (20 files)
   - `.claude/agents/doc-review/references/*.md` (3 files: owasp-top-10, rfc-2119-spec, abuse-patterns)

4. **Present your recommendations** as text output, NOT file edits

Format your output as:
```
## File: path/to/file.md

[Content here]

---

## File: path/to/next-file.md

[Content here]
```

Do not use Write or Edit tools. Output text only for human review.
