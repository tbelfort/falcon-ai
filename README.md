# Falcon-AI

**An agentic software engineering framework with empirical guardrails.**

**Website:** [getfalcon.dev](https://getfalcon.dev)

Falcon-AI is a complete framework for multi-agent software development. It provides structured workflows for design, implementation, and continuous improvement — with a feedback loop that learns from mistakes and prevents them from recurring.

---

## The Three Pillars

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FALCON-AI                                       │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│   1. DESIGN         │   2. IMPLEMENTATION │   3. IMPROVEMENT                │
│   (to be built)     │   (implemented)     │   (implemented)                 │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│ Design-Architect    │ Context Pack        │ Pattern Attribution             │
│ Systems-Architect   │ Spec                │ Baseline Principles             │
│ Ops-Architect       │ Implement           │ Derived Principles              │
│ PM (task creation)  │ PR Review           │ Warning Injection               │
│                     │ Merge               │                                 │
├─────────────────────┴─────────────────────┴─────────────────────────────────┤
│                         LINEAR INTEGRATION                                   │
│            Issues → Tasks → Branches → PRs → Merge → Done                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Design & Architecture *(to be implemented)*

A layered architect system that transforms ideas into implementation-ready specifications:

| Layer | Role | Input | Output |
|-------|------|-------|--------|
| 1 | **Design-Architect** | User conversation | `docs/design/` (85% detail) |
| 2 | **Systems-Architect** | `docs/design/` | `docs/systems/` (100% detail) |
| 3 | **Ops-Architect** | Running system | `docs/support/` (runbooks, guides) |
| 4 | **PM** | All `.md` files | Linear tasks with dependencies |

**Why the separation?** Humans produce good docs at 85% detail — the "obvious stuff" experienced devs just know. Agents need 100% pedantic specificity. The Systems-Architect closes that gap.

See [docs/design/vision.md](docs/design/vision.md) for the full design philosophy including project modes (MVP, Refine, Production) and the Constitution.

### 2. Implementation Workflow *(implemented)*

A structured pipeline from task assignment to merged code:

```
LINEAR ISSUE (Todo)
       ↓
   CHECKOUT ─────────────────────────────────────────────┐
       ↓                                                 │
   CONTEXT PACK ←── warnings injected ←──────────────┐   │
       ↓                                             │   │
   SPEC ←── warnings injected ←──────────────────┐   │   │
       ↓                                         │   │   │
   IMPLEMENT                                     │   │   │
       ↓                                         │   │   │
   PR REVIEW ─── findings ──→ ATTRIBUTION ───────┴───┘   │
       ↓                           ↓                     │
   MERGE                    PATTERN STORED               │
       ↓                                                 │
   DONE ←────────────────────────────────────────────────┘
```

**Workflow stages:**

| Stage | File | Purpose |
|-------|------|---------|
| Checkout | `.falcon/CORE/TASKS/WORKFLOW/CHECKOUT.md` | Claim task, create branch |
| Context Pack | `.falcon/CORE/TASKS/WORKFLOW/CONTEXT_PACK.md` | Extract relevant architecture into source-mapped doc |
| Spec | `.falcon/CORE/TASKS/WORKFLOW/SPEC.md` | Write implementation spec (detailed enough for zero judgment calls) |
| Implement | `.falcon/CORE/TASKS/WORKFLOW/IMPLEMENT.md` | Build from spec, create PR |
| PR Review | `.falcon/CORE/TASKS/WORKFLOW/PR_REVIEW.md` | 6 scouts + 6 judges evaluate the PR |
| Merge | `.falcon/CORE/TASKS/WORKFLOW/MERGE.md` | PM merges approved PRs |

**Key principle:** Specs leave nothing to decide. If the implementor must make judgment calls, the spec is incomplete.

### 3. Continuous Improvement *(implemented)*

An empirical feedback loop that learns from PR review findings:

```
PR Review finds issue
        ↓
Attribution Engine extracts evidence
        ↓
Failure Mode Resolver classifies (deterministic, not LLM)
        ↓
Pattern stored with provenance chain
        ↓
Future Context Pack/Spec agents receive warnings
        ↓
Same mistake prevented
```

**Two types of guardrails:**

| Type | Scope | Origin | Example |
|------|-------|--------|---------|
| **Baseline Principles** | Workspace | Seeded at init (11 security rules) | "Always use parameterized SQL queries" |
| **Learned Patterns** | Project | Extracted from PR review findings | "Search endpoints need rate limiting" |
| **Derived Principles** | Workspace | Promoted from recurring patterns | "All public APIs require rate limiting" |

---

## How Patterns Are Learned

### When: During PR Review

The PR Review workflow deploys 6 specialized scouts (security, bugs, spec compliance, etc.) and 6 judges. When a judge confirms a finding:

```typescript
// Scout finds issue
{
  type: 'security',
  title: 'SQL injection in user search',
  severity: 'CRITICAL',
  evidence: { file: 'src/api/users.ts', line: 42 }
}

// Judge confirms with root cause
{
  confirmed: true,
  rootCause: 'Spec said "build query dynamically" without mentioning parameterization',
  sourceDoc: 'specs/user-search.md#L15'
}
```

### What: Attribution Engine Extracts Evidence

The Attribution Agent (Claude API) extracts structured evidence:

```typescript
{
  sourceDocRef: 'specs/user-search.md#L15',
  citedGuidance: 'Build query dynamically based on filters',
  actualGuidance: null,  // No parameterization mentioned
  carrierInstruction: 'Use string interpolation for query building',
  failureFeatures: {
    citationPresent: true,
    mandatoryDocMissing: true,  // B01 baseline not cited
    vaguenessSignals: ['dynamically']
  }
}
```

### How: Deterministic Failure Mode Resolution

A decision tree (not LLM judgment) classifies what went wrong:

| Mode | Meaning | Decision Path |
|------|---------|---------------|
| `incorrect` | Guidance explicitly wrong | Carrier said harmful thing |
| `incomplete` | Guidance missing constraint | Mandatory doc not cited |
| `missing_reference` | Didn't cite required doc | Baseline/principle missing |
| `ambiguous` | Multiple interpretations | Vagueness signals detected |
| `conflict_unresolved` | Contradictory guidance | Conflict signals present |
| `synthesis_drift` | Carrier distorted source | Carrier != source meaning |

### Where: Patterns Are Injected

Warnings are injected at two workflow stages:

**1. Context Pack Agent** (`.falcon/CORE/TASKS/WORKFLOW/CONTEXT_PACK.md`)
```markdown
<!-- META-WARNING: NON-CITABLE CONTEXT -->
The following issues have occurred in similar past work:

### SQL Injection Prevention (CRITICAL)
**Source:** baseline-B01 | **Relevance:** database, user_input

Always use parameterized queries for SQL. Never interpolate user input.
```

**2. Spec Agent** (`.falcon/CORE/TASKS/WORKFLOW/SPEC.md`)
```markdown
<!-- META-WARNING: NON-CITABLE CONTEXT -->
### Rate Limiting Required (HIGH)
**Source:** pattern-P12 (3 occurrences) | **Relevance:** api, user_input

Search endpoints without rate limiting caused production outage.
Implement per-user rate limiting with 429 responses.
```

The warnings are marked non-citable — agents should apply the guidance silently, not reference it in their output.

---

## Installation

### Current Limitations

**Single-developer per project (v1).** All pattern data is stored locally on your machine (`~/.falcon-ai/db/falcon.db`). Multi-developer sync is planned for a future release.

This means:
- Patterns you learn won't automatically sync to teammates
- Each developer has their own independent guardrail history
- This is fine for solo projects and local development

### Requirements

- Node.js 20.0.0 or later
- Git repository (falcon-ai operates at the repo level)
- Git remote is **not required** (local-only repos work fine)
- `ANTHROPIC_API_KEY` environment variable (for attribution)

### Install

```bash
# Clone and install
git clone https://github.com/tbelfort/falcon-ai.git
cd falcon-ai
npm install
npm run build

# Link for global CLI access
npm link
```

### Initialize in Your Project

```bash
cd /path/to/your/project
falcon init
```

This creates:
- `.falcon/config.yaml` — Project configuration
- `.falcon/CORE/` — Workflow tasks, templates, and roles
- `.claude/commands/` — User-invokable commands
- `.claude/agents/` — Scout and judge agents
- Seeds 11 baseline security principles
- Registers project in falcon-ai database

### Gitignore Recommendations

After initialization, add these entries to your `.gitignore`:

```
.falcon/
.claude/commands/
.claude/agents/
```

These directories contain local CORE files that are installed from the falcon-ai package and should not be committed.

### Local-Only Mode

If your repository has no git remote configured, falcon-ai operates in local-only mode:
- Uses `local:<hash>` as the repository identifier
- Pattern data is stored locally on this machine only
- If you add a remote later, run `falcon init` again to update

---

## Configuration

### Project Config (`.falcon/config.yaml`)

```yaml
version: "1.0"
workspaceId: "550e8400-e29b-41d4-a716-446655440000"
projectId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8"

workspace:
  slug: my-team
  name: "My Team Workspace"

project:
  name: "api-service"

# Optional: Linear integration
linear:
  projectId: "API"
  teamId: "team-abc123"

settings:
  maxInjectedWarnings: 6           # Cap on total warnings (default: 6)
  crossProjectWarningsEnabled: false  # Share patterns across projects
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API access for attribution |
| `LINEAR_API_KEY` | No | Linear integration for issue tracking |

---

## CLI Usage

### Core Commands

```bash
falcon init                    # Initialize project
falcon status                  # Show configuration and statistics
falcon doctor                  # Run diagnostic checks
falcon health                  # View attribution health metrics
```

### Workspace & Project Management

```bash
falcon workspace list          # List all workspaces
falcon workspace create <slug> # Create workspace
falcon workspace archive <slug> # Archive workspace
falcon workspace rename <old> <new> # Rename workspace slug

falcon project list            # List projects
falcon project create          # Create project
falcon delete [--force]        # Delete current project
```

### Deleting Projects

The `falcon delete` command requires double confirmation:
1. Type "yes" to confirm deletion
2. Type the full project name to verify

Use `--force` to skip confirmations (dangerous).

Note: Deleting a project removes all patterns, occurrences, and data from the local database. The workspace is NOT deleted.

### Kill Switch (Safety Controls)

```bash
falcon pause                   # Pause pattern creation
falcon resume                  # Resume pattern creation
```

When attribution precision drops below threshold, the kill switch automatically pauses pattern creation to prevent low-quality patterns from polluting the system.

---

## Implementation Workflow Details

### Roles

| Role | File | Responsibilities |
|------|------|------------------|
| PM | `.falcon/CORE/ROLES/PM.md` | Merge PRs, sync worktrees, manage Linear |
| Architect | `.falcon/CORE/ROLES/ARCHITECT.md` | Technical decisions, architecture |
| QA | `.falcon/CORE/ROLES/QA.md` | Test strategy, quality gates |
| DBA | `.falcon/CORE/ROLES/DBA.md` | Database design, migrations |
| Ops | `.falcon/CORE/ROLES/OPS.md` | Deployment, monitoring, incidents |
| Doc-Manager | `.falcon/CORE/ROLES/DOC-MANAGER.md` | Documentation taxonomy |

### Agents (PR Review)

The PR Review workflow uses specialized agents:

**Scouts** (Sonnet — fast, flag potential issues):
| Agent | File | Focus |
|-------|------|-------|
| security | `.claude/agents/pr-scout-security.md` | Security vulnerabilities |
| bugs | `.claude/agents/pr-scout-bugs.md` | Logic errors, edge cases |
| spec | `.claude/agents/pr-scout-spec.md` | Spec compliance |
| tests | `.claude/agents/pr-scout-tests.md` | Test coverage |
| docs | `.claude/agents/pr-scout-docs.md` | Documentation |
| decisions | `.claude/agents/pr-scout-decisions.md` | Architectural decisions |
| adversarial | `.claude/agents/pr-scout-adversarial.md` | Attack vectors |

**Judges** (Opus — thorough, evaluate scout findings):
| Agent | File | Focus |
|-------|------|-------|
| security | `.claude/agents/pr-judge-security.md` | Confirm/reject security findings |
| bugs | `.claude/agents/pr-judge-bugs.md` | Confirm/reject bug findings |
| ... | ... | ... |

### Commands

| Command | File | Purpose |
|---------|------|---------|
| checkout | `.claude/commands/checkout.md` | Start work on an issue |
| doc-review | `.claude/commands/doc-review.md` | Review documentation |
| merge | `.claude/commands/pm/merge.md` | Merge approved PRs |
| build_sprint | `.claude/commands/pm/build_sprint.md` | Create sprint from backlog |
| code-review | `.claude/commands/pm/code-review.md` | Trigger code review |

---

## Baseline Principles

Falcon-AI seeds 11 baseline security principles when you initialize:

| ID | Principle | Touches | Reference |
|----|-----------|---------|-----------|
| B01 | Parameterized SQL queries | database, user_input | CWE-89 |
| B02 | Validate all external input | user_input | CWE-20 |
| B03 | Never log secrets or PII | logging, auth | CWE-532 |
| B04 | Explicit authorization checks | auth, authz | CWE-862 |
| B05 | Timeouts on network calls | network | — |
| B06 | Exponential backoff with jitter | network | — |
| B07 | Idempotency keys for retries | network, database | — |
| B08 | Size and rate limits | user_input, api | CWE-400 |
| B09 | Migration rollback strategy | schema | — |
| B10 | Error contract definition | api | — |
| B11 | Least-privilege credentials | database, auth, config | CWE-250 |

These are always considered for injection based on task profile matching.

---

## Programmatic Integration

For integrating falcon-ai into your agent orchestration:

### Before Context Pack Agent

```typescript
import { beforeContextPackAgent } from 'falcon-ai/workflow';
import { getDatabase } from 'falcon-ai/storage';

const db = getDatabase();

const result = beforeContextPackAgent(db, {
  workspaceId: config.workspaceId,
  projectId: config.projectId,
  issue: {
    id: 'PROJ-123',
    title: 'Add user search API',
    description: 'Implement search endpoint...',
    labels: ['feature', 'api'],
  }
});

// Inject into agent prompt
const agentPrompt = `
${result.warningsMarkdown}

## Your Task
${originalTaskDescription}
`;
```

### Before Spec Agent

```typescript
import { beforeSpecAgent } from 'falcon-ai/workflow';

const result = beforeSpecAgent(db, {
  workspaceId: config.workspaceId,
  projectId: config.projectId,
  issue: { ... }
});

// result.warningsMarkdown - formatted warnings
// result.taskProfile - extracted task metadata
// result.injectionLogId - audit trail ID
```

### After PR Review

```typescript
import { onPRReviewComplete } from 'falcon-ai/workflow';

await onPRReviewComplete(db, {
  workspaceId: config.workspaceId,
  projectId: config.projectId,
  issueId: 'PROJ-123',
  prNumber: 456,
  confirmedFindings: [
    {
      id: 'finding-1',
      scoutType: 'security',
      title: 'Missing rate limiting',
      description: 'Search endpoint has no rate limiting...',
      severity: 'HIGH',
      category: 'security',
    }
  ]
}, contextPack, spec);

// Attribution runs automatically
// Patterns created/updated as appropriate
```

---

## Architecture Overview

### Core Entities

| Entity | Scope | Purpose |
|--------|-------|---------|
| Workspace | Global | Groups related projects |
| Project | Workspace | Single repository registration |
| PatternDefinition | Project | Reusable pattern (bad guidance) |
| PatternOccurrence | Project | Instance of pattern (append-only) |
| DerivedPrinciple | Workspace | Baseline or promoted pattern |
| ExecutionNoncompliance | Project | Agent ignored correct guidance |
| ProvisionalAlert | Project | Short-lived alert (14 days) |
| InjectionLog | Project | Audit trail of injections |

### Installed Structure (After `falcon init`)

```
your-project/
├── .falcon/
│   ├── config.yaml          # Project configuration
│   └── CORE/
│       ├── TASKS/WORKFLOW/  # Workflow stages (checkout, spec, implement, etc.)
│       ├── ROLES/           # Agent roles (PM, architect, QA, etc.)
│       └── TEMPLATES/       # Document templates
│
└── .claude/
    ├── commands/            # User-invokable commands
    └── agents/              # Specialized agents (scouts, judges)
```

### Package Structure (falcon-ai source)

```
falcon-ai/
├── CORE/                    # Source files (copied during init)
│   ├── TASKS/WORKFLOW/
│   ├── ROLES/
│   ├── agents/
│   ├── commands/
│   └── TEMPLATES/
│
├── src/
│   ├── cli/                 # Command-line interface
│   ├── storage/             # SQLite database and repositories
│   ├── schemas/             # Zod validation schemas
│   ├── attribution/         # Pattern attribution engine
│   ├── injection/           # Warning injection system
│   ├── workflow/            # Integration hooks
│   ├── evolution/           # Learning and decay processors
│   ├── metrics/             # Observability and reporting
│   ├── services/            # Business logic (kill switch, etc.)
│   └── config/              # Configuration loading
│
├── docs/
│   └── design/              # Design philosophy and vision
│
└── specs/                   # Implementation specifications
```

---

## Design Philosophy

### Constitution (Architectural DNA)

The Constitution defines immutable principles that govern ALL development decisions:

| Article | Principle |
|---------|-----------|
| I | **Determinism Over LLM Judgment** — Pattern attributions use decision trees, not LLM classification |
| II | **Specs Leave Nothing to Decide** — If implementor must make judgment calls, spec is incomplete |
| III | **Systems Docs Before Build** — For agent workflows, systems docs written BEFORE implementation |
| IV | **Append-Only History** — Occurrence records never mutated; mark inactive instead of delete |
| V | **Separate Belief from Action** — Attribution confidence ≠ injection priority |

### Why Deterministic Resolution?

LLMs are great at extraction but inconsistent at classification. By using Claude only for evidence extraction and a decision tree for failure mode resolution:
- **Reproducibility** — Same evidence → same classification
- **Debuggability** — Decision tree is inspectable
- **Stability** — No drift from model updates

### Why Two Architect Layers?

- **Design docs** (85% detail) — What humans naturally produce
- **Systems docs** (100% detail) — What agents need to execute reliably

The Systems-Architect's job is to make implicit knowledge explicit — the pedantic details that are easy for an agent with full context but hard for an agent mid-implementation.

### Why Token-Conscious Injection?

Agents have context limits and attention decay. By capping at 6 warnings and using tiered selection:
- **Security first** — Critical patterns always injected
- **Relevance** — Task profile matching reduces noise
- **No fatigue** — Agents don't learn to ignore warnings

---

## Development

### Building

```bash
npm run build      # Compile TypeScript
npm run typecheck  # Type check without emitting
```

### Testing

```bash
npm test           # Watch mode
npm run test:run   # Single run
```

---

## Credits

The pattern learning and feedback loop concepts in this project were inspired by [say-your-harmony](https://github.com/say828/say-your-harmony).

---

## License

**MIT** — See [LICENSE](LICENSE) for details.
