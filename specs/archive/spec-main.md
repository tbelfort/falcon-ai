# Spec: Meta-Learning Workflow Orchestration System

## Version: 1.0.0
## Date: 2026-01-18
## Status: Draft

---

## 0) Executive Summary

This spec defines a **multi-agent workflow orchestration system** integrated with a **negative feedback learning loop**. The system enhances the existing CORE/TASKS/WORKFLOW/ with:

1. **TypeScript-based orchestration** (modeled after say-your-harmony)
2. **PR Scout feedback integration** that captures problems in JSON
3. **Pattern Attribution Analysis** - agents that determine if decisions caused problems
4. **Negative Consequence Tracking** - a separate file loaded alongside positive patterns

The goal: **Close the learning loop** so that decisions leading to bugs are identified and fed back into future Context Pack and Spec creation.

---

## 1) Problem Statement

### Current State

The CORE/TASKS/WORKFLOW/ system has:
- Context Pack creation (CONTEXT_PACK.md)
- Spec creation and review
- PR Review with 6 scouts + 6 judges
- Linear integration for issue tracking

**Gap**: When PR scouts find bugs, we don't trace them back to the decisions that caused them. Pattern learning is only positive ("what worked") but not negative ("what decision led to this bug").

### Desired State

1. When a PR scout identifies a problem → Write to `scout-findings.json`
2. After PR review → Spawn **Pattern Attribution Agent**
3. Agent reads findings → Spawns sub-agents asking: "Did any documented decision cause this?"
4. If attribution found → Write to `negative-consequences.json`
5. Future Context Packs → Load both positive patterns AND negative consequences

---

## 2) Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     META-LEARNING WORKFLOW SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │   CONTEXT    │    │    SPEC      │    │     IMPLEMENTATION       │   │
│  │    PACK      │ →  │  CREATION    │ →  │      (PR Created)        │   │
│  └──────────────┘    └──────────────┘    └──────────┬───────────────┘   │
│         ↑                                            │                   │
│         │                                            ▼                   │
│         │                              ┌──────────────────────────────┐  │
│         │                              │        PR REVIEW             │  │
│         │                              │  ┌─────────────────────────┐ │  │
│         │                              │  │    6 Scouts (sonnet)    │ │  │
│         │                              │  │  • Security             │ │  │
│         │                              │  │  • Docs Compliance      │ │  │
│         │                              │  │  • Bug Hunter           │ │  │
│         │                              │  │  • Test Quality         │ │  │
│         │                              │  │  • Decisions            │ │  │
│         │                              │  │  • Spec Compliance      │ │  │
│         │                              │  └──────────┬──────────────┘ │  │
│         │                              │             │                │  │
│         │                              │             ▼                │  │
│         │                              │  ┌─────────────────────────┐ │  │
│         │                              │  │   scout-findings.json   │ │  │
│         │                              │  │   (NEW: Problem Log)    │ │  │
│         │                              │  └──────────┬──────────────┘ │  │
│         │                              └─────────────┼────────────────┘  │
│         │                                            │                   │
│         │                                            ▼                   │
│         │                              ┌──────────────────────────────┐  │
│         │                              │  PATTERN ATTRIBUTION AGENT   │  │
│         │                              │  ┌─────────────────────────┐ │  │
│         │                              │  │  For each finding:      │ │  │
│         │                              │  │  → Spawn Attribution    │ │  │
│         │                              │  │    Sub-Agent (haiku)    │ │  │
│         │                              │  │  → "Did pattern X      │ │  │
│         │                              │  │     cause this?"        │ │  │
│         │                              │  └──────────┬──────────────┘ │  │
│         │                              │             │                │  │
│         │                              │             ▼                │  │
│         │                              │  ┌─────────────────────────┐ │  │
│         │                              │  │ negative-consequences   │ │  │
│         │                              │  │        .json            │ │  │
│         │                              │  └──────────┬──────────────┘ │  │
│         │                              └─────────────┼────────────────┘  │
│         │                                            │                   │
│         └────────────────────────────────────────────┘                   │
│                          (Feedback Loop)                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3) Component Definitions

### 3.1 Directory Structure

```
meta-learning/
├── src/                          # TypeScript implementation
│   ├── agents/                   # Agent definitions
│   │   ├── types.ts              # Agent type definitions
│   │   ├── definitions.ts        # All agent configs
│   │   ├── scouts/               # PR Scout agents
│   │   │   ├── adversarial.ts    # Security scout
│   │   │   ├── docs.ts           # Docs compliance scout
│   │   │   ├── bugs.ts           # Bug hunter scout
│   │   │   ├── tests.ts          # Test quality scout
│   │   │   ├── decisions.ts      # Decisions scout
│   │   │   └── spec.ts           # Spec compliance scout
│   │   ├── judges/               # PR Judge agents
│   │   │   └── ... (mirrors scouts)
│   │   ├── attribution/          # Pattern attribution
│   │   │   ├── coordinator.ts    # Main attribution agent
│   │   │   └── analyzer.ts       # Per-finding analyzer
│   │   └── workflow/             # Workflow orchestration
│   │       ├── context-pack.ts   # Context pack agent
│   │       ├── spec-creator.ts   # Spec creation agent
│   │       └── pr-review.ts      # PR review orchestrator
│   ├── storage/                  # Data persistence
│   │   ├── scout-findings.ts     # Scout findings I/O
│   │   ├── negative-consequences.ts  # Negative patterns I/O
│   │   └── patterns.ts           # Positive patterns I/O
│   ├── schemas/                  # JSON schemas (Zod)
│   │   ├── scout-finding.ts
│   │   └── negative-consequence.ts
│   ├── lib/                      # Utilities
│   │   ├── linear-client.ts      # Linear API wrapper
│   │   └── github-client.ts      # GitHub API wrapper
│   ├── hooks/                    # Claude Code hooks
│   │   ├── post-pr-review.ts     # Triggers attribution
│   │   └── pre-context-pack.ts   # Loads negative patterns
│   └── index.ts                  # Main entry point
├── agents/                       # Agent markdown definitions
│   ├── scouts/
│   ├── judges/
│   └── attribution/
├── CORE/
│   └── TASKS/
│       └── WORKFLOW/             # Existing workflow docs (updated)
├── data/                         # Runtime data
│   ├── scout-findings/           # Per-PR findings
│   └── patterns/                 # Learned patterns
│       ├── positive/             # What works
│       └── negative/             # What caused problems
└── specs/
    └── spec-main.md              # This spec
```

### 3.2 Agent Definitions

#### Agent Type System (src/agents/types.ts)

```typescript
export type ModelType = 'opus' | 'sonnet' | 'haiku' | 'inherit';

export type AgentCategory =
  | 'scout'           // PR review scouts (read-only analysis)
  | 'judge'           // PR review judges (evaluation)
  | 'attribution'     // Pattern attribution agents
  | 'workflow'        // Workflow orchestration
  | 'utility';        // Support agents

export interface AgentConfig {
  name: string;
  description: string;
  category: AgentCategory;
  model: ModelType;
  cost: 'CHEAP' | 'EXPENSIVE';
  tools: string[];
  prompt: string;
}

export interface ScoutFinding {
  id: string;                      // UUID
  prNumber: number;
  scoutType: ScoutType;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  blocking: boolean;
  title: string;
  description: string;
  location: {
    file: string;
    line?: number;
    function?: string;
  };
  evidence: string;               // Code snippet or explanation
  timestamp: string;              // ISO 8601
  issueId: string;                // Linear issue ID (CON-XXX)
}

export type ScoutType =
  | 'adversarial'
  | 'docs'
  | 'bugs'
  | 'tests'
  | 'decisions'
  | 'spec';

export interface NegativeConsequence {
  id: string;                      // UUID
  findingId: string;               // References ScoutFinding.id
  patternId: string;               // ID of the pattern that caused this
  patternSource: 'context-pack' | 'spec' | 'architecture-doc' | 'design-doc';
  patternLocation: {
    file: string;
    section?: string;
  };
  attribution: {
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string;
    alternativeApproach?: string;
  };
  timestamp: string;
  analyzedBy: string;              // Agent that made attribution
}
```

#### Scout Agents (6 types)

Each scout follows this pattern:

```typescript
// src/agents/scouts/adversarial.ts
export const adversarialScoutConfig: AgentConfig = {
  name: 'pr-scout-adversarial',
  description: 'Find security issues, production failure modes, attack vectors',
  category: 'scout',
  model: 'sonnet',
  cost: 'CHEAP',
  tools: ['Read', 'Grep', 'Glob'],  // Read-only
  prompt: `# Security Scout

## Role
You are a security-focused code reviewer. Your job is to find vulnerabilities,
attack vectors, and production failure modes.

## CRITICAL: Output Format
For EVERY issue found, you MUST write to scout-findings.json:

\`\`\`json
{
  "scoutType": "adversarial",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "blocking": true|false,
  "title": "Brief title",
  "description": "Detailed description",
  "location": { "file": "path/to/file.ts", "line": 42 },
  "evidence": "Code snippet or attack scenario"
}
\`\`\`

## Areas to Examine
1. Input validation (injection attacks)
2. Authentication/authorization bypasses
3. Secrets exposure
4. Path traversal
5. Race conditions
6. Error handling that leaks info
7. Dependency vulnerabilities

## Remember
- Security issues take ABSOLUTE precedence
- Cannot be dismissed because "spec allowed it"
- Write to JSON even for suspicions (mark as LOW)
`
};
```

#### Pattern Attribution Coordinator (src/agents/attribution/coordinator.ts)

```typescript
export const attributionCoordinatorConfig: AgentConfig = {
  name: 'pattern-attribution-coordinator',
  description: 'Coordinates pattern attribution analysis for scout findings',
  category: 'attribution',
  model: 'sonnet',
  cost: 'CHEAP',
  tools: ['Read', 'Grep', 'Glob', 'Task', 'Write'],
  prompt: `# Pattern Attribution Coordinator

## Role
You coordinate pattern attribution analysis. For each scout finding, you spawn
an analyzer sub-agent to determine if any documented decision/pattern caused it.

## Process

### Step 1: Load Findings
Read all findings from \`data/scout-findings/{pr-number}.json\`

### Step 2: Load Pattern Sources
Gather all pattern sources to check:
- Context Pack for the issue
- Spec document
- Referenced architecture docs
- Design documents

### Step 3: Spawn Analyzers (PARALLEL)
For each finding, spawn a pattern-attribution-analyzer:

\`\`\`typescript
Task({
  subagent_type: 'pattern-attribution-analyzer',
  model: 'haiku',  // Cheap for parallel execution
  prompt: \`
    FINDING:
    \${JSON.stringify(finding)}

    PATTERN SOURCES:
    \${patternSourcesText}

    QUESTION: Did any documented decision or pattern directly cause or
    contribute to this finding? If yes, identify which pattern and explain why.

    Output format:
    {
      "attributed": true|false,
      "patternId": "ID if found",
      "confidence": "HIGH|MEDIUM|LOW",
      "reasoning": "Why this pattern caused the issue",
      "alternativeApproach": "What should have been done instead"
    }
  \`
})
\`\`\`

### Step 4: Collect & Write Results
Collect all analyzer outputs. For attributed findings, write to:
\`data/patterns/negative/negative-consequences.json\`

### Step 5: Generate Summary
Create human-readable summary for Linear comment.
`
};
```

#### Pattern Attribution Analyzer (src/agents/attribution/analyzer.ts)

```typescript
export const attributionAnalyzerConfig: AgentConfig = {
  name: 'pattern-attribution-analyzer',
  description: 'Analyzes a single finding for pattern attribution',
  category: 'attribution',
  model: 'haiku',  // Cheap for parallel execution
  cost: 'CHEAP',
  tools: ['Read', 'Grep'],  // Minimal tools
  prompt: `# Pattern Attribution Analyzer

## Role
You analyze a single PR scout finding to determine if it was caused by a
documented decision or pattern.

## Input
You receive:
1. A scout finding (problem found during PR review)
2. Pattern sources (Context Pack, Spec, architecture docs)

## Analysis Framework

### Step 1: Understand the Finding
- What is the actual problem?
- What code/behavior is incorrect?
- What should it have been instead?

### Step 2: Trace Back
- Read the Context Pack - did it recommend this approach?
- Read the Spec - did it specify this behavior?
- Read architecture docs - did they mandate this pattern?

### Step 3: Evaluate Attribution
**HIGH confidence**: Pattern explicitly recommended the problematic approach
**MEDIUM confidence**: Pattern implied this approach or didn't prevent it
**LOW confidence**: Pattern tangentially related, may have influenced thinking

### Step 4: Output
Return JSON:
\`\`\`json
{
  "attributed": true,
  "patternId": "context-pack-section-3.2",
  "patternSource": "context-pack",
  "patternLocation": {
    "file": "linear-docs/CON-123-context-pack.md",
    "section": "3.2 Recommended Approach"
  },
  "confidence": "HIGH",
  "reasoning": "The Context Pack explicitly recommended using X pattern which
                leads to Y vulnerability when Z condition occurs.",
  "alternativeApproach": "Should have recommended W pattern instead, which
                         handles Z condition safely."
}
\`\`\`

If no attribution found:
\`\`\`json
{
  "attributed": false,
  "reasoning": "The issue appears to be an implementation error not traceable
                to any documented decision."
}
\`\`\`
`
};
```

---

## 4) Data Schemas

### 4.1 Scout Finding Schema (src/schemas/scout-finding.ts)

```typescript
import { z } from 'zod';

export const ScoutFindingSchema = z.object({
  id: z.string().uuid(),
  prNumber: z.number().int().positive(),
  issueId: z.string().regex(/^CON-\d+$/),
  scoutType: z.enum([
    'adversarial',
    'docs',
    'bugs',
    'tests',
    'decisions',
    'spec'
  ]),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  blocking: z.boolean(),
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(2000),
  location: z.object({
    file: z.string(),
    line: z.number().int().positive().optional(),
    function: z.string().optional()
  }),
  evidence: z.string().min(10).max(5000),
  timestamp: z.string().datetime(),
  judgeVerdict: z.enum(['CONFIRMED', 'DISMISSED', 'MODIFIED']).optional(),
  judgeReasoning: z.string().optional()
});

export type ScoutFinding = z.infer<typeof ScoutFindingSchema>;

export const ScoutFindingsFileSchema = z.object({
  version: z.literal('1.0.0'),
  prNumber: z.number().int().positive(),
  issueId: z.string(),
  generatedAt: z.string().datetime(),
  findings: z.array(ScoutFindingSchema)
});
```

### 4.2 Negative Consequence Schema (src/schemas/negative-consequence.ts)

```typescript
import { z } from 'zod';

export const NegativeConsequenceSchema = z.object({
  id: z.string().uuid(),
  findingId: z.string().uuid(),

  // What pattern caused this
  patternId: z.string(),
  patternSource: z.enum([
    'context-pack',
    'spec',
    'architecture-doc',
    'design-doc',
    'code-pattern'
  ]),
  patternLocation: z.object({
    file: z.string(),
    section: z.string().optional(),
    lineRange: z.object({
      start: z.number(),
      end: z.number()
    }).optional()
  }),
  patternContent: z.string().max(2000),  // The actual pattern text

  // Attribution details
  attribution: z.object({
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    reasoning: z.string().min(50).max(1000),
    alternativeApproach: z.string().max(1000).optional(),
    preventionMeasure: z.string().max(500).optional()
  }),

  // Metadata
  timestamp: z.string().datetime(),
  analyzedBy: z.string(),
  issueId: z.string(),
  prNumber: z.number()
});

export type NegativeConsequence = z.infer<typeof NegativeConsequenceSchema>;

export const NegativeConsequencesFileSchema = z.object({
  version: z.literal('1.0.0'),
  lastUpdated: z.string().datetime(),
  consequences: z.array(NegativeConsequenceSchema)
});
```

---

## 5) Integration Points

### 5.1 PR Review Flow (Updated)

The PR_REVIEW.md workflow is updated to:

1. **Phase 2 (Deploy Scouts)**: Each scout writes findings to JSON
2. **Phase 3 (Deploy Judges)**: Judges update findings with verdicts
3. **NEW Phase 6.5 (Pattern Attribution)**: After report, run attribution

```typescript
// src/hooks/post-pr-review.ts
export async function postPrReviewHook(prNumber: number, issueId: string) {
  // Load confirmed findings only
  const findings = await loadScoutFindings(prNumber);
  const confirmedFindings = findings.filter(f => f.judgeVerdict === 'CONFIRMED');

  if (confirmedFindings.length === 0) {
    console.log('No confirmed findings, skipping attribution');
    return;
  }

  // Spawn attribution coordinator
  await Task({
    subagent_type: 'pattern-attribution-coordinator',
    prompt: `
      PR #${prNumber} has ${confirmedFindings.length} confirmed findings.
      Issue: ${issueId}

      Run pattern attribution analysis.
    `
  });
}
```

### 5.2 Context Pack Flow (Updated)

The CONTEXT_PACK.md workflow is updated to load negative consequences:

```typescript
// src/hooks/pre-context-pack.ts
export async function preContextPackHook(issueId: string) {
  // Load positive patterns (existing)
  const positivePatterns = await loadPatterns('positive');

  // NEW: Load negative consequences
  const negativeConsequences = await loadNegativeConsequences();

  // Filter to relevant consequences (by component type, technology, etc.)
  const relevantNegatives = filterRelevantConsequences(negativeConsequences, {
    issueId,
    componentType: await getComponentType(issueId)
  });

  // Return combined context
  return {
    positivePatterns,
    negativeConsequences: relevantNegatives,
    warningSection: generateWarningSection(relevantNegatives)
  };
}
```

### 5.3 Scout Output Integration

Each scout is updated to write to JSON:

```typescript
// src/storage/scout-findings.ts
import { v4 as uuid } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

const FINDINGS_DIR = 'data/scout-findings';

export async function writeScoutFinding(
  prNumber: number,
  finding: Omit<ScoutFinding, 'id' | 'timestamp'>
): Promise<string> {
  const findingWithMeta: ScoutFinding = {
    ...finding,
    id: uuid(),
    timestamp: new Date().toISOString()
  };

  const filePath = path.join(FINDINGS_DIR, `${prNumber}.json`);

  // Load existing or create new
  let existingData = { version: '1.0.0', prNumber, findings: [] };
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    existingData = JSON.parse(content);
  } catch (e) {
    // File doesn't exist yet
  }

  existingData.findings.push(findingWithMeta);
  existingData.generatedAt = new Date().toISOString();

  await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));

  return findingWithMeta.id;
}
```

---

## 6) Workflow Modifications

### 6.1 Updated PR_REVIEW.md Sections

Add to **Phase 2 (Deploy Scouts)**:

```markdown
### Scout Output Requirements

Each scout MUST write findings to JSON using the storage API:

\`\`\`typescript
await writeScoutFinding(prNumber, {
  prNumber: ${prNumber},
  issueId: "${issueId}",
  scoutType: "adversarial",  // Your scout type
  severity: "HIGH",
  blocking: true,
  title: "SQL Injection in user input",
  description: "The user input is concatenated directly into SQL...",
  location: { file: "src/db/queries.ts", line: 42 },
  evidence: "const query = `SELECT * FROM users WHERE id = ${userId}`"
});
\`\`\`

This enables downstream pattern attribution.
```

Add **Phase 6.5: Pattern Attribution**:

```markdown
## Phase 6.5: Pattern Attribution (NEW)

After generating the PR review report, trigger pattern attribution:

### Step 6.5.1: Check for Confirmed Findings

If there are CONFIRMED findings from judges, proceed. Otherwise, skip.

### Step 6.5.2: Spawn Attribution Coordinator

\`\`\`bash
# Trigger attribution (runs asynchronously)
Task({
  subagent_type: "pattern-attribution-coordinator",
  run_in_background: true,
  prompt: "PR #${prNumber}, Issue ${issueId}: Run pattern attribution"
})
\`\`\`

### Step 6.5.3: Attribution Results

The coordinator will:
1. Spawn analyzer sub-agents (haiku, parallel) for each finding
2. Check Context Pack, Spec, and architecture docs
3. Write attributed patterns to \`data/patterns/negative/negative-consequences.json\`
4. Post summary to Linear issue

### Step 6.5.4: Update Linear

Add attribution summary to the issue:

\`\`\`bash
python project-management/tools/linear.py issue comment CON-XXX "Agent: Pattern Attribution Complete.

**Findings Analyzed:** X
**Attributions Found:** Y

**Attributed Patterns:**
1. [Pattern ID]: [Brief description] → [Consequence]

These patterns have been logged for future avoidance."
\`\`\`
```

### 6.2 Updated CONTEXT_PACK.md Sections

Add to **Step 0: Load Patterns**:

```markdown
## Step 0: Load Patterns (Meta-Learning)

### 0.1 Load Positive Patterns
\`\`\`bash
meta-learning context --task context-pack 2>/dev/null || true
\`\`\`

### 0.2 Load Negative Consequences (NEW)
\`\`\`bash
meta-learning negative-consequences --component-type ${COMPONENT_TYPE} 2>/dev/null || true
\`\`\`

If negative consequences load, add a **Warnings** section to the Context Pack:

\`\`\`markdown
## 9) Warnings from Past Issues

The following patterns have previously caused problems. AVOID them:

### From CON-123 (HIGH confidence)
**Pattern:** Using raw SQL concatenation for dynamic queries
**Consequence:** SQL injection vulnerability discovered in PR #456
**Alternative:** Use parameterized queries with prepared statements

### From CON-234 (MEDIUM confidence)
**Pattern:** Assuming Pydantic frozen=True prevents all mutations
**Consequence:** Mutable list fields could still be modified
**Alternative:** Use tuple[X, ...] for immutable collections
\`\`\`
```

---

## 7) Agent Markdown Definitions

### 7.1 agents/scouts/adversarial.md

```markdown
# Security Scout - PR Review Phase

> **Agent Type**: Scout
> **Model**: sonnet
> **Cost**: CHEAP
> **Tools**: Read, Grep, Glob (READ-ONLY)

---

## Role

You are the **Security Scout** for PR reviews. Your job is to find security vulnerabilities, attack vectors, and production failure modes.

> **"Security issues take ABSOLUTE precedence over everything else."**

---

## Core Philosophy

### Security Cannot Be Dismissed

- A security finding CANNOT be dismissed because "the spec allowed it"
- A security finding CANNOT be dismissed because "the architecture permits it"
- If a security issue exists, everything upstream (spec, architecture) was WRONG

### Write Everything

Even suspicions get logged. The judge will evaluate, but you MUST log.

---

## Process

### Step 1: Identify Attack Surface

Read all changed files. Identify:
- User input entry points
- Database queries
- File operations
- Authentication/authorization checks
- External API calls
- Serialization/deserialization

### Step 2: Apply Security Checklist

For each attack surface, check:

| Category | What to Look For |
|----------|------------------|
| Injection | SQL, command, LDAP, XPath injection |
| Auth | Bypass, session issues, credential exposure |
| XSS | Reflected, stored, DOM-based |
| CSRF | Missing tokens, SameSite issues |
| Path Traversal | ../ in file paths |
| SSRF | Unvalidated URLs |
| Secrets | Hardcoded API keys, passwords |
| Race Conditions | TOCTOU, double-spend |
| Error Handling | Info leakage in errors |

### Step 3: Write Findings to JSON

For EVERY issue (even LOW severity):

```json
{
  "scoutType": "adversarial",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "blocking": true,
  "title": "Brief title (max 100 chars)",
  "description": "Detailed description of the vulnerability",
  "location": {
    "file": "path/to/file.ts",
    "line": 42,
    "function": "processUserInput"
  },
  "evidence": "Actual code or attack scenario"
}
```

### Step 4: Return Summary

Return a summary of all findings for the orchestrator.

---

## Severity Guidelines

| Severity | Criteria | Blocking |
|----------|----------|----------|
| CRITICAL | RCE, auth bypass, data breach | YES |
| HIGH | SQL injection, XSS, CSRF | YES |
| MEDIUM | Info disclosure, weak crypto | YES |
| LOW | Best practice violation | NO |

---

## Output Format

```markdown
## Security Scout Report

**Files Reviewed:** X
**Findings:** Y (X CRITICAL, Y HIGH, Z MEDIUM, W LOW)

### Finding 1: [Title]
- **Severity:** CRITICAL
- **Location:** src/api/user.ts:42
- **Description:** ...
- **Evidence:** ...

[JSON written to scout-findings.json]
```
```

### 7.2 agents/attribution/coordinator.md

```markdown
# Pattern Attribution Coordinator

> **Agent Type**: Attribution
> **Model**: sonnet
> **Cost**: CHEAP
> **Tools**: Read, Grep, Glob, Task, Write

---

## Role

You are the **Pattern Attribution Coordinator**. After PR review completes, you analyze confirmed findings to determine if any documented decisions/patterns caused them.

> **"Every bug has a root cause. If that cause was documented advice, we must track it."**

---

## Core Philosophy

### Close the Learning Loop

Bugs aren't random. They often stem from:
- Advice in Context Packs
- Patterns in Specs
- Guidance in architecture docs

If we can trace bugs back to their source patterns, we can:
1. Warn future Context Packs about these patterns
2. Update documentation to remove bad advice
3. Improve the meta-learning system

### Parallel Analysis

Each finding is independent. Spawn analyzers in parallel for efficiency.

---

## Process

### Step 1: Load Findings

```typescript
const findings = await loadScoutFindings(prNumber);
const confirmed = findings.filter(f => f.judgeVerdict === 'CONFIRMED');
```

### Step 2: Gather Pattern Sources

Load all potential sources:
1. **Context Pack** for this issue (Linear document)
2. **Spec** if it exists (Linear document)
3. **Architecture docs** referenced in Context Pack
4. **Design docs** referenced in Spec

### Step 3: Spawn Analyzers (PARALLEL)

For each confirmed finding:

```typescript
Task({
  subagent_type: 'pattern-attribution-analyzer',
  model: 'haiku',
  prompt: `
    FINDING:
    ${JSON.stringify(finding)}

    PATTERN SOURCES:
    ${patternSourcesText}

    Determine if any documented pattern caused this finding.
  `
})
```

### Step 4: Collect Results

Wait for all analyzers. Collect their outputs.

### Step 5: Write Negative Consequences

For each attributed finding:

```typescript
await writeNegativeConsequence({
  findingId: finding.id,
  patternId: attribution.patternId,
  patternSource: attribution.patternSource,
  patternLocation: attribution.patternLocation,
  patternContent: extractPatternContent(attribution.patternLocation),
  attribution: {
    confidence: attribution.confidence,
    reasoning: attribution.reasoning,
    alternativeApproach: attribution.alternativeApproach
  },
  issueId,
  prNumber
});
```

### Step 6: Generate Summary

Create summary for Linear:

```markdown
## Pattern Attribution Results

**Findings Analyzed:** 5
**Attributions Found:** 2

### Attributed Patterns

1. **context-pack-section-3.2** (HIGH confidence)
   - Finding: SQL Injection in user input
   - Pattern: "Use string interpolation for dynamic queries"
   - Alternative: Use parameterized queries

2. **spec-section-4.1** (MEDIUM confidence)
   - Finding: Missing input validation
   - Pattern: "Trust upstream validation"
   - Alternative: Validate at every boundary

These patterns have been logged to negative-consequences.json
```

---

## Tools

- **Read**: Load findings, pattern sources
- **Grep**: Search for pattern content
- **Glob**: Find relevant files
- **Task**: Spawn analyzer sub-agents
- **Write**: Save negative consequences

---

## Success Metrics

- ✅ All confirmed findings analyzed
- ✅ Attributions have clear reasoning
- ✅ Alternative approaches suggested
- ✅ Results written to JSON
- ✅ Summary posted to Linear
```

---

## 8) Storage Implementation

### 8.1 Negative Consequences Storage (src/storage/negative-consequences.ts)

```typescript
import { v4 as uuid } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { NegativeConsequence, NegativeConsequencesFileSchema } from '../schemas/negative-consequence';

const NEGATIVE_FILE = 'data/patterns/negative/negative-consequences.json';

export async function loadNegativeConsequences(): Promise<NegativeConsequence[]> {
  try {
    const content = await fs.readFile(NEGATIVE_FILE, 'utf-8');
    const parsed = NegativeConsequencesFileSchema.parse(JSON.parse(content));
    return parsed.consequences;
  } catch (e) {
    return [];
  }
}

export async function writeNegativeConsequence(
  consequence: Omit<NegativeConsequence, 'id' | 'timestamp'>
): Promise<string> {
  const withMeta: NegativeConsequence = {
    ...consequence,
    id: uuid(),
    timestamp: new Date().toISOString()
  };

  const existing = await loadNegativeConsequences();
  existing.push(withMeta);

  const data = {
    version: '1.0.0' as const,
    lastUpdated: new Date().toISOString(),
    consequences: existing
  };

  await fs.mkdir(path.dirname(NEGATIVE_FILE), { recursive: true });
  await fs.writeFile(NEGATIVE_FILE, JSON.stringify(data, null, 2));

  return withMeta.id;
}

export function filterRelevantConsequences(
  consequences: NegativeConsequence[],
  context: { componentType?: string; technologies?: string[] }
): NegativeConsequence[] {
  // Filter by component type, technology, recency, confidence
  return consequences
    .filter(c => c.attribution.confidence !== 'LOW')
    .sort((a, b) => {
      // Sort by confidence (HIGH first), then recency
      const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const confDiff = confOrder[a.attribution.confidence] - confOrder[b.attribution.confidence];
      if (confDiff !== 0) return confDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    })
    .slice(0, 10);  // Max 10 warnings
}

export function generateWarningSection(consequences: NegativeConsequence[]): string {
  if (consequences.length === 0) return '';

  let section = '## 9) Warnings from Past Issues\n\n';
  section += 'The following patterns have previously caused problems. AVOID them:\n\n';

  for (const c of consequences) {
    section += `### From ${c.issueId} (${c.attribution.confidence} confidence)\n`;
    section += `**Pattern:** ${truncate(c.patternContent, 200)}\n`;
    section += `**Consequence:** ${truncate(c.attribution.reasoning, 200)}\n`;
    if (c.attribution.alternativeApproach) {
      section += `**Alternative:** ${c.attribution.alternativeApproach}\n`;
    }
    section += '\n';
  }

  return section;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}
```

---

## 9) CLI Commands

### 9.1 Main CLI (src/cli/index.ts)

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { loadNegativeConsequences, filterRelevantConsequences } from './storage/negative-consequences';

const program = new Command();

program
  .name('meta-learning')
  .description('Meta-learning workflow orchestration')
  .version('1.0.0');

program
  .command('context')
  .description('Load context patterns for a task')
  .option('--task <type>', 'Task type (context-pack, spec, etc.)')
  .action(async (options) => {
    // Load positive patterns
    console.log('Loading positive patterns...');
    // Implementation
  });

program
  .command('negative-consequences')
  .description('Load negative consequences for warnings')
  .option('--component-type <type>', 'Component type to filter')
  .option('--limit <n>', 'Max consequences to return', '10')
  .action(async (options) => {
    const all = await loadNegativeConsequences();
    const filtered = filterRelevantConsequences(all, {
      componentType: options.componentType
    }).slice(0, parseInt(options.limit));

    console.log(JSON.stringify(filtered, null, 2));
  });

program
  .command('attribute')
  .description('Run pattern attribution for a PR')
  .requiredOption('--pr <number>', 'PR number')
  .requiredOption('--issue <id>', 'Linear issue ID')
  .action(async (options) => {
    // Trigger attribution coordinator
    console.log(`Running attribution for PR #${options.pr}, issue ${options.issue}`);
    // Implementation
  });

program.parse();
```

---

## 10) Testing Strategy

### 10.1 Unit Tests

```typescript
// src/__tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { ScoutFindingSchema, NegativeConsequenceSchema } from '../schemas';

describe('ScoutFindingSchema', () => {
  it('validates a complete finding', () => {
    const finding = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      prNumber: 123,
      issueId: 'CON-456',
      scoutType: 'adversarial',
      severity: 'HIGH',
      blocking: true,
      title: 'SQL Injection vulnerability',
      description: 'User input is directly concatenated into SQL query...',
      location: { file: 'src/db.ts', line: 42 },
      evidence: 'const query = `SELECT * FROM users WHERE id = ${userId}`',
      timestamp: '2026-01-18T10:00:00.000Z'
    };

    expect(() => ScoutFindingSchema.parse(finding)).not.toThrow();
  });

  it('rejects invalid severity', () => {
    const finding = {
      // ... with severity: 'INVALID'
    };

    expect(() => ScoutFindingSchema.parse(finding)).toThrow();
  });
});

describe('NegativeConsequenceSchema', () => {
  it('validates an attributed consequence', () => {
    const consequence = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      findingId: '550e8400-e29b-41d4-a716-446655440001',
      patternId: 'context-pack-section-3.2',
      patternSource: 'context-pack',
      patternLocation: { file: 'linear-docs/CON-123-cp.md', section: '3.2' },
      patternContent: 'Use string interpolation for queries...',
      attribution: {
        confidence: 'HIGH',
        reasoning: 'The Context Pack explicitly recommended...',
        alternativeApproach: 'Use parameterized queries'
      },
      timestamp: '2026-01-18T10:00:00.000Z',
      analyzedBy: 'pattern-attribution-analyzer',
      issueId: 'CON-456',
      prNumber: 123
    };

    expect(() => NegativeConsequenceSchema.parse(consequence)).not.toThrow();
  });
});
```

### 10.2 Integration Tests

```typescript
// src/__tests__/attribution-flow.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { writeScoutFinding, loadScoutFindings } from '../storage/scout-findings';
import { writeNegativeConsequence, loadNegativeConsequences } from '../storage/negative-consequences';

describe('Attribution Flow', () => {
  beforeEach(async () => {
    // Clean test data
  });

  it('writes scout findings and loads them', async () => {
    const findingId = await writeScoutFinding(123, {
      prNumber: 123,
      issueId: 'CON-456',
      scoutType: 'adversarial',
      severity: 'HIGH',
      blocking: true,
      title: 'Test finding',
      description: 'Test description for the finding...',
      location: { file: 'test.ts' },
      evidence: 'const x = 1'
    });

    const findings = await loadScoutFindings(123);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe(findingId);
  });

  it('writes and filters negative consequences', async () => {
    await writeNegativeConsequence({
      findingId: 'test-finding-id',
      patternId: 'test-pattern',
      patternSource: 'context-pack',
      patternLocation: { file: 'test.md' },
      patternContent: 'Test pattern content',
      attribution: {
        confidence: 'HIGH',
        reasoning: 'Test reasoning explanation...'
      },
      analyzedBy: 'test',
      issueId: 'CON-123',
      prNumber: 100
    });

    const consequences = await loadNegativeConsequences();
    expect(consequences.length).toBeGreaterThan(0);
  });
});
```

---

## 11) Implementation Plan

### Phase 1: Foundation (TypeScript Setup)
1. Initialize TypeScript project with Vitest
2. Create directory structure
3. Implement schemas (Zod)
4. Implement storage layer
5. Write unit tests

### Phase 2: Agent Definitions
1. Create agent markdown files for scouts
2. Create agent markdown files for attribution
3. Update PR_REVIEW.md with JSON output requirements
4. Update CONTEXT_PACK.md with negative consequence loading

### Phase 3: Integration
1. Implement CLI commands
2. Implement hooks (post-pr-review, pre-context-pack)
3. Write integration tests
4. Test with real PR review

### Phase 4: Refinement
1. Tune confidence thresholds
2. Add filtering heuristics for relevant consequences
3. Document usage in workflow docs
4. Create examples

---

## 12) Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Scouts write to JSON | 100% of findings captured |
| Attribution runs | Coordinator spawns analyzers for all confirmed findings |
| Attributions accurate | >70% human-verified accuracy |
| Feedback loop complete | Negative consequences appear in future Context Packs |
| Performance | Attribution adds <30s to PR review |

---

## 13) Open Questions

### BLOCKER
None - design is complete.

### NON-BLOCKER
1. **Confidence decay**: Should old negative consequences decay in relevance?
2. **Deduplication**: How to handle duplicate attributions across PRs?
3. **UI**: Should negative consequences have a dashboard view?

---

## 14) Appendix: Sample Data

### Sample scout-findings.json

```json
{
  "version": "1.0.0",
  "prNumber": 456,
  "issueId": "CON-123",
  "generatedAt": "2026-01-18T14:30:00.000Z",
  "findings": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "prNumber": 456,
      "issueId": "CON-123",
      "scoutType": "adversarial",
      "severity": "HIGH",
      "blocking": true,
      "title": "SQL Injection in user search",
      "description": "The search query directly interpolates user input without sanitization, allowing SQL injection attacks.",
      "location": {
        "file": "src/api/search.ts",
        "line": 87,
        "function": "searchUsers"
      },
      "evidence": "const query = `SELECT * FROM users WHERE name LIKE '%${searchTerm}%'`",
      "timestamp": "2026-01-18T14:25:00.000Z",
      "judgeVerdict": "CONFIRMED",
      "judgeReasoning": "Verified - no input sanitization exists"
    }
  ]
}
```

### Sample negative-consequences.json

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-01-18T15:00:00.000Z",
  "consequences": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "findingId": "550e8400-e29b-41d4-a716-446655440000",
      "patternId": "context-pack-CON-123-section-4.2",
      "patternSource": "context-pack",
      "patternLocation": {
        "file": "linear://doc/context-pack-CON-123",
        "section": "4.2 Database Query Patterns"
      },
      "patternContent": "For simple queries, use template literals for readability: `SELECT * FROM ${table} WHERE ${column} = ${value}`",
      "attribution": {
        "confidence": "HIGH",
        "reasoning": "The Context Pack explicitly recommended template literals for SQL queries without mentioning parameterization. This directly led to the SQL injection vulnerability.",
        "alternativeApproach": "Always use parameterized queries: db.query('SELECT * FROM users WHERE name LIKE ?', [`%${searchTerm}%`])",
        "preventionMeasure": "Add SQL injection warning to Context Pack template"
      },
      "timestamp": "2026-01-18T14:45:00.000Z",
      "analyzedBy": "pattern-attribution-analyzer",
      "issueId": "CON-123",
      "prNumber": 456
    }
  ]
}
```

---

## 15) Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-18 | Initial spec |
