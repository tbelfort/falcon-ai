# Falcon-AI Design Vision

## Core Assumption

**The user is ALWAYS an engineer.** This is NOT built for vibe coders. AI should:
- Use highly technical vocabulary
- Assume deep technical competence
- Maximize user involvement by default
- Only simplify when user explicitly requests "make quick best-case decisions for everything"

---

## Constitution (Architectural DNA)

The Constitution defines **immutable principles** that govern ALL development decisions. Agents must justify every decision against these articles. Constitutional violations are CRITICAL and block progress.

```markdown
# falcon-ai Constitution

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

## Governance
- Constitution supersedes all other practices
- Amendments require explicit user approval
- All specs must verify constitutional compliance
- Violations block implementation
```

The Constitution lives in `docs/systems/CONSTITUTION.md` and is referenced by all architect roles.

---

## Conventions

### Use Case Numbering

Use cases are numbered with `UC` prefix for tracking and reference:

```
UC1: Developer checks docs before commit
     $ linkcheck ./docs
     ✓ 142 links checked, 0 broken

UC2: CI fails on broken links
     $ linkcheck ./docs --strict
     ✗ 2 broken links found (exit code 1)

UC3: Ignore known-flaky external URLs
     $ linkcheck ./docs --ignore-pattern "example.com/*"

UC4: Output for tooling integration
     $ linkcheck ./docs --format json > report.json
```

This allows referencing specific use cases in technical docs, tasks, and reviews (e.g., "This component satisfies UC2 and UC4").

---

## Role Separation

### The Four Architect Layers

| Layer | Role | Input | Output | Detail Level |
|-------|------|-------|--------|--------------|
| 1 | **Design-Architect** | User conversation | docs/design/ | 85% (draft, "good enough for humans") |
| 2 | **Systems-Architect** | docs/design/ | docs/systems/ | 100% (formal, "pedantic enough for agents") |
| 3 | **Ops-Architect** | docs/systems/ + running system | docs/support/ | Operational (runbooks, guides, incidents) |
| 4 | **PM** | All .md files | Linear tasks | Task breakdown |

```
Design-Architect → Systems-Architect → Build Workflow → Ops-Architect (ongoing)
                                              ↑
                                   PM creates Linear tasks
```

### Why This Separation?

**Humans vs Agents:**
- Humans make good decisions with loose technical docs (85% detail)
- Agents make unreliable decisions without pedantic specificity (need 100%)

**Design docs** are what humans naturally produce — technical, detailed, but with gaps. The "obvious stuff" that experienced devs just know.

**Systems docs** close that gap. The Systems-Architect's job is to make implicit knowledge explicit. The pedantic details that are:
- Easy for an agent with full context and no coding pressure
- Hard for an agent mid-implementation without access to docs

### Role Details

**Design-Architect:** Linear-agnostic. Produces docs/design/ (problem, vision, use cases, edge cases, technical, components, UX). Works with user to capture intent. Output is comprehensive but "draft" — missing the pedantic details.

**Systems-Architect:** Linear-agnostic. Takes docs/design/ and produces docs/systems/ (architecture, APIs, schemas, configs, invariants). Has its own workflow (like CORE/TASKS/WORKFLOW/ for building). Output is formal, complete, leaves nothing implicit.

**Ops-Architect:** Linear-agnostic. Produces docs/support/ (runbooks, deployment guides, troubleshooting, incidents, integrations). Works post-deploy, ongoing. Captures operational knowledge like docker-refresh procedures, common issues, recovery steps.

**PM:** Linear expert. Takes .md files from all architects and creates Linear tasks. Never writes design/systems/support docs.

### Existing Codebase Mode

For existing codebases without documentation:

```
Standard flow:    Design-Architect → Systems-Architect → Build
Existing codebase: (skip)          → Systems-Architect → Build
                                            ↑
                                    Builds from CODE, not docs
```

The Systems-Architect can operate in two modes:
1. **From Design:** Read docs/design/, produce docs/systems/
2. **From Code:** Read existing codebase, reverse-engineer docs/systems/

This allows onboarding existing projects into the falcon-ai workflow.

---

## Project Modes

Falcon-AI operates in three modes based on project importance and lifecycle stage.

### Mode 1: MVP / Throw-away

**Goal:** One command → interview → everything built → tasks ready

**Use when:** Quick prototypes, experiments, tools you might delete tomorrow

**Interaction style:** COMMAND. Script-like. Follow steps, ask questions, execute.

**Flow:**
```
User runs command
      ↓
Architect interviews:
  - What should it do?
  - What language?
  - CLI vs GUI?
  - Any constraints?
      ↓
Architect builds (using sub-architect agents for actual work):
  - Vision (minimal)
  - Technical design
  - Component breakdown
      ↓
Architect exits, hands off to PM
      ↓
PM creates Linear tasks
      ↓
Done. User has tasks ready to implement.
```

**Key detail:** Architect doesn't build docs itself — it orchestrates sub-agents (builder workflows) that do the actual work. Architect interviews and coordinates.

**Human involvement:** Answer interview questions. That's it.

**Quality bar:** Works. That's it.

---

### Mode 2: Refine

**Goal:** Take an MVP to the next level, or build something you'll use regularly (not production, but matters)

**Use when:** The MVP works and you want to improve it, or building a personal tool you'll rely on

**Interaction style:** MIXED. Stages 1-2 are command-driven. Stage 3 is free-form chat.

**Flow:**

#### Stage 1: Vision & Use Cases (COMMAND)
```
User runs command
      ↓
Architect interviews:
  - What's the current state?
  - What's wrong with it?
  - What should it become?
  - Who uses it? How?
      ↓
Architect asks for clarification until satisfied
      ↓
Architect builds vision.md and use-cases.md
      ↓
Architect exits. Waits for user to start next stage.
```

#### Stage 2: Technical (FREE-FORM CHAT)
```
User starts conversation (not a command)
      ↓
Architect reviews vision/use-cases docs
      ↓
Architect suggests: "OK, we need to decide X first"
      ↓
Back-and-forth discussion:
  - Architect proposes options
  - User asks questions, pushes back
  - They iterate until aligned
      ↓
Architect builds technical.md incrementally during chat
      ↓
When technical captures vision/use-cases sufficiently:
  Architect signals "Ready to build components/UX"
```

#### Stage 3: Components & Interface (LIGHT APPROVAL)
```
Architect makes suggestions for components and interface
      ↓
User either:
  - Approves: "Looks good, go"
  - Brainstorms: short back-and-forth
      ↓
Architect builds components.md
      ↓
Hands off to PM for Linear tasks
```

**Human involvement:** High on vision/use cases (but command-driven). Medium on technical (chat). Light on components.

**Quality bar:** Reliable, maintainable, documented enough to return to later.

---

### Mode 3: Production

**Goal:** Enterprise-grade. Built to last. Full collaboration.

**Use when:** Production systems, tools used by teams, anything with real consequences

**Interaction style:** COLLABORATIVE throughout. This takes days, not hours.

**Flow:**

| Stage | Style | How it works |
|-------|-------|--------------|
| Vision | Collaborative chat | Both contribute, iterate until aligned. Multiple sessions OK. |
| Use Cases | Collaborative chat | Deep dive on edge cases, failure modes, adversarial scenarios. |
| Technical | **Full collaboration** | Back-and-forth brainstorming over days. Explore options together. Neither proceeds until both agree. May involve research spikes. |
| Interface | User-controlled | User provides mockups, UX direction. Architect implements user's vision. |
| Components | AI proposes, user approves | Less input needed — technical foundation is solid. Quick approval or refinement. |
| Tasks | AI-driven | PM generates comprehensive Linear tasks with acceptance criteria |

**Human involvement:** Heavy throughout, especially technical. This is a partnership, not delegation.

**Quality bar:** Production-ready. Handles edge cases. Documented. Tested. Maintainable by others.

---

## Optional Flags (Any Mode)

### `--research` / `--no-research`

Pre-research phase: Survey existing tools, prior art, why not use what exists.

- **Default for Mode 1:** OFF (just build it)
- **Default for Mode 2:** Optional (ask user)
- **Default for Mode 3:** ON (always understand the space first)

User can override for any mode:
- "Skip the research, I know what's out there"
- "Actually, let's see what exists first"

---

## Mode Selection

**The USER decides the mode, not the AI.** The AI lacks context to make this decision — only the user knows the project's importance, timeline, and risk tolerance.

AI presents options at conversation start:

```
What type of project is this?

1. MVP/Throw-away — I'll handle everything, just answer a few questions
2. Refine — You guide vision, I handle technical execution
3. Production — Full collaboration on architecture and design
```

The user can:
- Select explicitly: "Mode 2" or "This is a quick MVP"
- Change modes mid-project: "Let's upgrade this to Mode 3"
- Skip the question: "Production-grade please" as first message

**The AI never auto-detects or assumes mode.** It always asks or accepts explicit instruction.

---

## Templates as Prompts

Templates aren't just structure — they're **sophisticated prompts that constrain agent behavior**.

### Template Locations

| Purpose | Location | Status |
|---------|----------|--------|
| Build workflow | `CORE/TASKS/WORKFLOW/` | Exists (CONTEXT_PACK, SPEC, IMPLEMENT, etc.) |
| Design docs | `CORE/TEMPLATES/design/` | To be built |
| Systems docs | `CORE/TEMPLATES/systems/` | To be built |

### Constraint Mechanisms

Templates should use these mechanisms to guide agent behavior:

| Mechanism | Example | Effect |
|-----------|---------|--------|
| **Mandatory markers** | `(*mandatory*)` | Signals non-negotiable sections |
| **Priority labels** | P1/P2/P3 | Forces ranking of importance |
| **Given/When/Then** | Acceptance criteria format | Forces concrete testable scenarios |
| **`[NEEDS CLARIFICATION]`** | Ambiguity marker | Teaches agent to flag, not assume |
| **Numbered requirements** | FR-001, UC-001, SC-001 | Enables traceability |
| **Independent Test field** | YES/NO per story | Forces testability consideration |

### Example: Use Case Template

```markdown
## UC-001: [NAME] (P1 - Critical) (*mandatory*)

**User Story**: As a [ROLE], I want to [ACTION] so that [BENEFIT]

**Acceptance Criteria** (Given/When/Then):
- Given [PRECONDITION]
- When [ACTION]
- Then [EXPECTED_RESULT]

**Edge Cases**:
- [NEEDS CLARIFICATION]: What happens when...?

**Testable Independently**: [YES/NO]
```

Templates turn vague requests into structured, complete specifications by forcing the agent to fill required fields rather than making assumptions.

---

## Summary Table

| Aspect | Mode 1 (MVP) | Mode 2 (Refine) | Mode 3 (Production) |
|--------|--------------|-----------------|---------------------|
| **Interaction** | Command (scripted) | Mixed (command + chat) | Collaborative (chat) |
| Vision | AI interviews, AI writes | Command: AI interviews, AI writes | Chat: both contribute |
| Use Cases | AI generates | Command: AI interviews, AI writes | Chat: both contribute |
| Technical | AI decides | Chat: AI proposes, user discusses | Chat: **both decide together** |
| Interface | AI decides | AI proposes options, user picks | User controls (mockups OK) |
| Components | AI generates | AI generates, light approval | AI proposes, user approves |
| Tasks | PM generates | PM generates | PM generates |
| Research | Off | Optional | On |
| Duration | Minutes | Hours-to-days | Days-to-weeks |
| Sessions | 1 | 2-3 | Many |

## Agent Orchestration

| Mode | Architect Role | Sub-agents | PM Role |
|------|----------------|------------|---------|
| Mode 1 | Interview + orchestrate | Sub-architects do building | Takes .md → Linear |
| Mode 2 | Interview (stage 1), collaborate (stage 2-3) | Sub-architects do building | Takes .md → Linear |
| Mode 3 | Full collaboration partner | Sub-architects do building | Takes .md → Linear |

The Architect is always the user-facing agent. Sub-architects are invisible workers.

---

## Pipeline Stages

Every project flows through these stages, though entry points vary:

```
Stage 0: Problem/Vision     → Why are we building this?
Stage 1: Use Cases          → How will it be used? By whom?
Stage 2: Technical          → How is it built? (architecture, components, UX)
Stage 3: Task Structure     → What are the atomic work units?
Stage 4: Linear             → Tracked issues
Stage 5: Build              → Implementation
Stage 6: Verify             → Systems docs verified against reality
```

### Entry Points by Work Type

| Scenario | Entry Point | Flow |
|----------|-------------|------|
| New project | Stage 0 (Vision) | 0 → 1 → 2 → 3 → 4 → 5 → 6 |
| New feature | Stage 0 (Vision) | Read Systems → 0 → 1 → 2 → 3 → 4 → 5 → 6 |
| Bug fix | Stage 3 (Task) | Read Systems → 3 → 4 → 5 → maybe 6 |
| Refactor | Stage 2 (Technical) | Read Systems → 2 → 3 → 4 → 5 → 6 |
| Quick improvement | Stage 3 (Task) | 3 → 4 → 5 |

**Vision and Use Cases aren't always required.** They're the entry point for *new capabilities*, not all work.

---

## Project Scale

### The Decision: Flat vs Hierarchical

**Does this have subsystems that could be built independently?**

| Signal | Structure |
|--------|-----------|
| Could be one file/module | Single system (flat) |
| Multiple independent concerns | Subsystems (hierarchical) |
| "This part doesn't need that part to work" | Subsystems |
| Everything is tangled together | Single system (even if complex) |

### Small Projects (Single System)

Go straight from vision to technical to components:

```
docs/design/linkcheck/
├── vision.md
├── use-cases.md
├── technical.md
└── components.md
```

### Large Projects (Subsystems + Milestones)

Break into subsystems first, coordinate with milestones:

```
docs/design/doom/
├── vision.md              ← Overall vision
├── use-cases.md           ← Player experiences
├── systems-map.md         ← All subsystems and relationships
├── milestones.md          ← Deliverable groupings
└── subsystems/
    ├── rendering/
    │   ├── vision.md
    │   ├── use-cases.md
    │   ├── technical.md
    │   └── components.md
    ├── physics/
    ├── audio/
    └── ...
```

### Milestones Coordinate Subsystems

Milestones group subsystems into deliverables:

```
M1: "Moving Camera"         ← Game loop + rendering + input
M2: "Textured World"        ← Rendering (textures) + levels
M3: "Things Exist"          ← Entities + physics + sprites
M4: "Combat"                ← Weapons + AI + audio
M5: "Full Game"             ← UI + save/load + polish
```

Dependencies determine build order. Each subsystem gets the full Design → Systems → Build treatment.

---

## Case Study: Operating System

The ultimate stress test — a Unix-style OS built with this framework.

### Subsystem Decomposition

```
unix-os/
├── bootloader/         ← Get CPU to known state, load kernel
├── kernel/
│   ├── memory/         ← Physical/virtual memory, allocator
│   ├── process/        ← PCB, context switching
│   ├── scheduler/      ← Which process runs next
│   ├── syscalls/       ← User/kernel boundary
│   └── interrupts/     ← Hardware/software interrupt handling
├── drivers/
│   ├── console/        ← Text output
│   ├── keyboard/       ← Input
│   ├── disk/           ← Storage
│   └── timer/          ← Clock tick
├── filesystem/         ← inodes, directories, read/write
├── shell/              ← Command interpreter
└── utils/              ← ls, cat, cp, echo, etc.
```

### Milestone Structure

```
M1: "Hello from kernel"     ← Bootloader + console driver
M2: "Memory works"          ← Physical allocator, paging
M3: "One process runs"      ← Process struct, single execution
M4: "Context switch"        ← Timer interrupt, scheduler
M5: "Multiple processes"    ← fork(), process table
M6: "Files exist"           ← Filesystem, open/read/write
M7: "Shell runs"            ← exec(), pipes, PATH
M8: "Self-hosting"          ← Can compile itself on itself
```

### Key Insight

**Big projects = hierarchy of design cycles**

```
Top-level Design-Architect
├── Subsystem 1: Full Design → Systems → Build cycle
├── Subsystem 2: Full Design → Systems → Build cycle
├── ...
└── Integration: Glue subsystems together
```

Each subsystem is **small enough to fit in one agent's head**. The top-level coordinates them.

---

## Human-Agent Collaboration Model

### The Role Shift

With agent-assisted development, the human role shifts from "implementer" to "architect with taste":

| Task | Human | Agent |
|------|-------|-------|
| Identify options | **Decide** | Research, explain tradeoffs |
| Understand concepts | **Learn/validate** | Research, explain, generate docs |
| Write code | **Review output** | Generate from spec |
| Debug | **Describe symptoms** | Hypothesize, suggest fixes |
| Judge quality | **Final call** | Propose, justify |

### What "Taste" Means

Knowing when something is right or wrong, even if you couldn't write it yourself:
- "This feels over-engineered"
- "This spec is ambiguous here"
- "Option B is simpler, let's do that"
- "The output doesn't match the spec"

You don't need to write the code. You need to **guide** and **validate**.

### The Framework Removes Code from the Critical Path

```
Without framework:
  Human must know language deeply → writes code → fights bugs

With framework:
  Human understands domain → guides decisions → agent writes code
                                                       ↑
                                         Spec so detailed there's
                                         nothing left to decide
```

---

## Framework Evolution

The framework is designed to degrade gracefully as AI capabilities improve:

| Layer | Today | Future |
|-------|-------|--------|
| Design-Architect | Heavy collaboration | "Here's what I want" → done |
| Systems-Architect | Full workflow needed | Possibly automatic |
| Specs | Pedantic, multi-stage review | Less needed |
| Implementation | Careful review | Trust but verify |

The 85% → 100% pipeline exists because agents currently need it. When they don't, stages can be skipped. The structure remains valuable for verification and coordination.
