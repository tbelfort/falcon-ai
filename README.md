# Falcon-AI

**A pattern-based guardrail system for multi-agent software development.**

Falcon-AI closes the feedback loop that existing systems fail to close: it traces PR review findings back to the guidance that correlated with them, stores patterns with structured evidence (not LLM-generated names), and injects warnings into future agent runs to prevent recurring issues.

---

## The Problem

Multi-agent development systems (Claude, GPT, etc.) make mistakes. When a human reviewer catches a security vulnerability or architectural flaw, that knowledge typically dies in the PR comments. The next time an agent works on a similar task, it makes the same mistake again.

**Existing approaches fail because:**
- They use LLM-generated pattern names that drift and duplicate
- They extract rich evidence but store only summaries
- They build query functions that never get called
- They treat injection as an afterthought

## The Solution

Falcon-AI creates an empirical feedback loop:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   LINEAR ISSUE                                                          │
│        ↓                                                                │
│   CONTEXT PACK ←──────────────────────────────────────────────┐         │
│   (warnings injected)                                         │         │
│        ↓                                                      │         │
│   SPEC ←─────────────────────────────────────────────────┐    │         │
│   (warnings injected)                                    │    │         │
│        ↓                                                 │    │         │
│   IMPLEMENTATION → PR REVIEW → ATTRIBUTION ENGINE        │    │         │
│                                      ↓                   │    │         │
│                               PATTERN STORED ────────────┴────┘         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

When a PR review finds an issue:
1. **Attribution Engine** extracts structured evidence (who said what, where it came from)
2. **Failure Mode Resolver** deterministically classifies what went wrong (not LLM judgment)
3. **Pattern** is stored with content hash, provenance chain, and severity
4. **Future agents** receive contextually-relevant warnings before they make the same mistake

---

## Key Features

- **Deterministic classification** - Evidence extraction uses Claude, but failure mode is resolved by decision tree
- **Append-only history** - Occurrences are never deleted, ensuring full audit trail
- **Hierarchical scoping** - Patterns can be project-specific or shared across workspaces
- **Kill switch** - Automatic throttling when attribution health declines
- **Security bias** - Security patterns always get priority in injection
- **Token-conscious** - Caps injected warnings at 6 to prevent prompt fatigue

---

## Installation

### Requirements

- Node.js 20.0.0 or later
- Git repository (falcon-ai operates at the repo level)
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
- `.falcon/config.yaml` - Project configuration
- Seeds 11 baseline security principles
- Registers project in falcon-ai database

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

### Database Location

Falcon-AI stores data in `~/.falcon-ai/db/falcon.db` (SQLite with WAL mode).

---

## CLI Usage

### Core Commands

```bash
# Initialize project
falcon init [--workspace <slug>] [--name <name>]

# Check status
falcon status

# Run diagnostics
falcon doctor

# View attribution health metrics
falcon health
```

### Workspace Management

```bash
# List all workspaces
falcon workspace list

# Create workspace
falcon workspace create my-workspace --name "My Workspace"

# Archive workspace (soft delete)
falcon workspace archive my-workspace
```

### Project Management

```bash
# List projects in current workspace
falcon project list

# Create project
falcon project create --name "my-project"

# Delete project
falcon project delete <project-id>
```

### Kill Switch (Safety Controls)

```bash
# Pause pattern creation (when attribution quality is poor)
falcon pause

# Resume pattern creation
falcon resume

# Current state shown in 'falcon health'
```

---

## How It Works

### 1. Pattern Attribution

When a PR review finds an issue, falcon-ai traces it back to the guidance that caused it:

**Evidence Extraction (Claude API)**
```
Finding: "SQL injection vulnerability in user lookup"
    ↓
Evidence: {
  sourceDoc: "api-spec.md",
  citedGuidance: "Use string concatenation for dynamic queries",
  actualGuidance: "Use parameterized queries for all user input",
  carrierInstruction: "Build query using template literals"
}
```

**Failure Mode Resolution (Deterministic)**

| Mode | Meaning | Example |
|------|---------|---------|
| `incorrect` | Guidance explicitly wrong | "Disable CSRF for speed" |
| `incomplete` | Guidance missing constraint | Forgot to mention TLS |
| `missing_reference` | Didn't cite required doc | Ignored auth baseline |
| `ambiguous` | Multiple interpretations | "Make it fast" |
| `conflict_unresolved` | Contradictory guidance | Two docs disagree |
| `synthesis_drift` | Carrier distorted source | Spec misread context |

The resolver uses a decision tree based on evidence features, not LLM judgment. This ensures consistency and debuggability.

### 2. Pattern Storage

Patterns are stored with:
- **Structured ID** - Content hash, not LLM-generated name
- **Provenance chain** - Source doc → Carrier doc → Finding
- **Evidence bundle** - Full context for debugging
- **Severity** - CRITICAL, HIGH, MEDIUM, LOW
- **Touches** - Which system concerns it affects (auth, database, network, etc.)

```typescript
PatternDefinition {
  id: "pat_a1b2c3...",
  sourceDocRef: "specs/api-spec.md#L45",
  patternContent: "Using string interpolation for SQL queries",
  failureMode: "incorrect",
  severity: "CRITICAL",
  touches: ["database", "user_input"],
  contentHash: "sha256:abc123...",
  status: "active"
}
```

### 3. Warning Injection

Before agents run, falcon-ai injects relevant warnings:

**Tiered Selection Algorithm:**
1. **Baseline Principles** (guaranteed slot) - Core security rules
2. **Derived Principles** (guaranteed slot) - Workspace-level patterns
3. **Learned Patterns** (remaining slots) - Project-specific findings
4. **Provisional Alerts** (separate section) - Recent critical findings

**Task Profile Matching:**
```
Issue: "Add user search endpoint"
    ↓
Profile: {
  touches: [user_input, database, api],
  technologies: [typescript, postgresql],
  taskTypes: [feature]
}
    ↓
Matched Warnings:
  - B01: SQL parameterization (touches: database, user_input)
  - P12: Rate limiting on search (touches: api, user_input)
```

**Formatted Output:**
```markdown
<!-- NON-CITABLE: Internal guardrails, do not reference in spec -->

## Warnings

The following issues have occurred in similar past work:

### SQL Injection Prevention
**Severity:** CRITICAL | **Source:** baseline-B01

Always use parameterized queries for SQL. Never interpolate user input
into query strings.

**Rationale:** Prevents SQL injection, the most common database vulnerability.

---

### Rate Limiting Required
**Severity:** HIGH | **Source:** pattern-P12 (3 occurrences)

Search endpoints without rate limiting caused production outage on 2024-01.
Implement per-user rate limiting with 429 responses.
```

### 4. Evolution & Learning

**Confidence Decay:** Patterns lose confidence over time if not re-observed.

**Salience Detection:** When guidance is repeatedly ignored (3+ occurrences in 30 days), it's flagged for review.

**Provisional Alerts:** CRITICAL findings get immediate injection for 14 days before needing full pattern criteria.

**Kill Switch:** If attribution precision drops below threshold, pattern creation pauses automatically.

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
// result.summary - stats for logging
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
// Adherence tracked for injected warnings
```

### Update Adherence

```typescript
import { updateAdherence } from 'falcon-ai/workflow';

// After reviewing if agent followed the warning
await updateAdherence(db, occurrenceId, true);  // Agent followed warning
await updateAdherence(db, occurrenceId, false); // Agent ignored warning
```

---

## Baseline Principles

Falcon-ai seeds 11 baseline security principles (B01-B11) when you initialize:

| ID | Principle | Touches |
|----|-----------|---------|
| B01 | Parameterized SQL queries | database, user_input |
| B02 | Validate all external input | user_input |
| B03 | Never log secrets or PII | logging, auth |
| B04 | Explicit authorization checks | auth, authz |
| B05 | Timeouts on network calls | network |
| B06 | Exponential backoff with jitter | network |
| B07 | Idempotency keys for retries | network, database |
| B08 | Size and rate limits | user_input, api |
| B09 | Migration rollback strategy | schema |
| B10 | Error contract definition | api |
| B11 | Least-privilege credentials | database, auth, config |

These provide foundational guardrails that are always considered for injection.

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

### System Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Agent System                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Context Pack│  │    Spec     │  │     PR Review       │  │
│  │    Agent    │  │   Agent     │  │  (Scouts + Judges)  │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
└─────────┼────────────────┼─────────────────────┼─────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                       Falcon-AI                              │
│  ┌─────────────────────┐     ┌─────────────────────────┐    │
│  │   Injection System  │     │   Attribution Engine    │    │
│  │  - Task Profiling   │     │  - Evidence Extraction  │    │
│  │  - Warning Selection│     │  - Failure Resolution   │    │
│  │  - Formatting       │     │  - Pattern Storage      │    │
│  └─────────────────────┘     └─────────────────────────┘    │
│                    ▲                    │                    │
│                    │                    ▼                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    SQLite DB                         │    │
│  │   patterns, occurrences, principles, injection_logs  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Health Monitoring

### Kill Switch States

| State | Pattern Creation | Trigger |
|-------|------------------|---------|
| `active` | All patterns created | Normal operation |
| `inferred_paused` | Only verbatim/paraphrase | Precision below 60% |
| `fully_paused` | No new patterns | Manual or critical failure |

### Health Metrics

```bash
falcon health

# Output:
# Attribution Health (30-day rolling)
# ───────────────────────────────────
# Precision:       78% (target: >60%)
# Inferred Ratio:  22% (target: <40%)
# Improvement Rate: 65% (target: >50%)
#
# Kill Switch: active
# Last evaluated: 2024-01-15T10:30:00Z
```

### Diagnostic Checks

```bash
falcon doctor

# Checks:
# ✓ Database accessible and writable
# ✓ Config file valid
# ✓ Workspace exists
# ✓ Project exists
# ✓ Baselines seeded (11/11)
# ✓ Git remote configured
```

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

### Project Structure

```
src/
├── cli/           # Command-line interface
├── storage/       # SQLite database and repositories
├── schemas/       # Zod validation schemas
├── attribution/   # Pattern attribution engine
├── injection/     # Warning injection system
├── workflow/      # Integration hooks
├── evolution/     # Learning and decay processors
├── metrics/       # Observability and reporting
├── services/      # Business logic (kill switch, etc.)
└── config/        # Configuration loading
```

---

## Design Philosophy

### Why Deterministic Resolution?

LLMs are great at extraction but inconsistent at classification. By using Claude only for evidence extraction and a decision tree for failure mode resolution, we get:
- **Reproducibility** - Same evidence → same classification
- **Debuggability** - Decision tree is inspectable
- **Stability** - No drift from model updates

### Why Append-Only History?

Patterns evolve, but history matters. By never deleting occurrences (only marking them inactive), we maintain:
- **Full audit trail** - When did we learn this?
- **Decay calculation** - How often does this recur?
- **Debugging** - Why did we inject this warning?

### Why Token-Conscious Injection?

Agents have context limits and attention decay. By capping at 6 warnings and using tiered selection:
- **Security first** - Critical patterns always injected
- **Relevance** - Task profile matching reduces noise
- **No fatigue** - Agents don't learn to ignore warnings

### Why Separate Patterns from Noncompliance?

A finding can mean two things:
- The guidance was wrong (Pattern)
- The guidance was right but ignored (ExecutionNoncompliance)

Conflating these pollutes the feedback loop. Falcon-ai tracks them separately.

---

## License

MIT
