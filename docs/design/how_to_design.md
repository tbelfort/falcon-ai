# How to Design: A Guide for Agent-Assisted Development

This document captures the design methodology for falcon-ai projects. It's optimized for human-agent collaboration, not traditional human-only development.

---

## The Core Insight

**Humans and agents have opposite strengths:**

| Aspect | Humans | Agents |
|--------|--------|--------|
| Decisions without docs | Good (intuition, experience) | Unreliable |
| Documentation timing | After (capture what was decided) | Before (constrain what can be decided) |
| Spec detail needed | High-level is fine | Leave NOTHING to decide |
| Failure mode | "I should have written that down" | "I made an arbitrary choice that broke everything" |

**The inversion:** Humans document decisions after making them. Agents need decisions documented before they can execute.

---

## The Pipeline Stages

```
Stage 0: Problem/Vision     → Why are we building this?
Stage 1: Use Cases          → How will it be used? By whom?
Stage 2: Technical          → How is it built? (architecture, components, UX)
Stage 3: Task Structure     → What are the atomic work units?
Stage 4: Linear             → Tracked issues
Stage 5: Build              → Implementation
Stage 6: Verify             → Systems docs verified against reality
```

### Where Artifacts Live

| Stage | Artifacts | Location |
|-------|-----------|----------|
| 0-2 | Vision, use cases, technical design | docs/design/ |
| 2 | Formal architecture, APIs, schemas | docs/systems/ (written as [DRAFT]) |
| 3 | Task breakdown | specs/ (ephemeral) |
| 4 | Issues | Linear |
| 5 | Code | src/ |
| 6 | Verified docs | docs/systems/ ([DRAFT] removed) |

---

## Different Entry Points

Not everything starts at Vision. The entry point depends on what you're doing:

| Scenario | Entry Point | Flow |
|----------|-------------|------|
| New project | Stage 0 (Vision) | 0 → 1 → 2 → 3 → 4 → 5 → 6 |
| New feature | Stage 0 (Vision) | Read Systems → 0 → 1 → 2 → 3 → 4 → 5 → 6 |
| Bug fix | Stage 3 (Task) | Read Systems → 3 → 4 → 5 → maybe 6 |
| Refactor | Stage 2 (Technical) | Read Systems → 2 → 3 → 4 → 5 → 6 |
| Quick improvement | Stage 3 (Task) | 3 → 4 → 5 |

**Vision and Use Cases aren't always required.** They're the entry point for *new capabilities*, not all work.

---

## Project Scale: Small vs Large

### The Decision Point

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
Vision
   ↓
Use Cases (UC1, UC2, UC3...)
   ↓
Technical Design
   ↓
Components
   ↓
Tasks
```

**Example:** A CLI tool like `linkcheck`

```
docs/design/linkcheck/
├── vision.md
├── use-cases.md
├── technical.md
└── components.md
```

### Large Projects (Subsystems + Milestones)

Break into subsystems first, then design each:

```
Vision
   ↓
Use Cases
   ↓
Systems Map (identify all subsystems)
   ↓
Milestones (group subsystems into deliverables)
   ↓
Per-subsystem:
   ├── Technical
   ├── Components
   └── Tasks
```

**Example:** A game engine or operating system

```
docs/design/doom/
├── vision.md
├── use-cases.md
├── systems-map.md
├── milestones.md
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

---

## The Specificity Pipeline

The goal: **A spec so detailed the implementor is essentially typing what it says.**

```
Systems docs (foundational truth)
        ↓
Context Builder (extract relevant Systems for this task)
        ↓
Context Improver (fill gaps, add detail)
        ↓
Context Reviewer (ensure nothing missing)
        ↓
Spec Builder (create implementation spec)
        ↓
Spec Hardener (remove ALL ambiguity)
        ↓
Spec Reviewer (catch anything that could be misinterpreted)
        ↓
Implementor (executes, makes ZERO decisions)
```

Each stage **removes discretion**. By the time the implementor runs, there should be no judgment calls left.

---

## Human-Agent Collaboration

### The Shift

The human role shifts from "coder" to "architect with taste":

| Task | Human | Agent |
|------|-------|-------|
| Identify options | Decide | Research, explain tradeoffs |
| Understand concepts | Learn/validate | Research, explain, generate docs |
| Write code | Review output | Generate from spec |
| Debug | Describe symptoms | Hypothesize, suggest fixes |
| Judge quality | Final call | Propose, justify |

### What "Taste" Means

Knowing when something is right or wrong, even if you couldn't write it yourself:
- "This feels over-engineered"
- "This spec is ambiguous here"
- "Option B is simpler, let's do that"
- "The output doesn't match the spec"

You don't need to write the code. You need to **guide** and **validate**.

---

## Quality Gates

For quality-focused projects (Mode 2 and 3), each stage should have a gate:

| Gate | Question | Failure Mode Prevented |
|------|----------|------------------------|
| Worth solving? | Does this matter? To whom? | Building useless things |
| Understand space? | What exists? Why isn't it enough? | Reinventing wheels poorly |
| Scope defensible? | Can we say NO with this doc? | Scope creep |
| Edge cases covered? | What breaks? What's ambiguous? | "Nobody thought of that" bugs |
| Architecture reviewed? | What are we trading off? | Painted-into-corner designs |
| Interface dry-run? | Does the UX feel right on paper? | Unusable interfaces |
| Clean boundaries? | Can components be built independently? | Spaghetti dependencies |
| Atomic tasks? | Can someone pick this up with no context? | Blocked implementers |

### Adversarial Review

Each gate should include devil's advocate questions:
- **Vision**: "Why would someone NOT use this?"
- **Use Cases**: "What input breaks this?"
- **Technical**: "What's the stupidest way this could fail?"
- **Interface**: "What will users misunderstand?"
- **Tasks**: "What's missing that will block the implementer?"

---

## Framework Scaling

The framework is designed to degrade gracefully as AI capabilities improve:

| Layer | Today | Future (as AI improves) |
|-------|-------|-------------------------|
| Design-Architect | Heavy collaboration | "Here's what I want" → done |
| Systems-Architect | Full workflow needed | Possibly automatic |
| Specs | Pedantic, multi-stage review | Less needed |
| Implementation | Careful review | Trust but verify |

The 85% → 100% pipeline exists because agents currently need it. When they don't, stages can be skipped.

---

## Case Study: Complex Project (OS Kernel)

To illustrate how the framework handles extreme complexity:

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

### Dependency Map

```
                    ┌──────────┐
                    │ Game Loop│ ← Foundation, built first
                    └────┬─────┘
                         │
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
    ┌─────────┐    ┌──────────┐    ┌─────────┐
    │  Input  │    │ Rendering│    │  Audio  │
    └────┬────┘    └────┬─────┘    └─────────┘
         │              │
         ...continues...
```

Dependencies determine build order. Each subsystem gets the full Design → Systems → Build treatment.

### Key Insight

**Big projects = hierarchy of design cycles**

```
Top-level Design-Architect
├── Subsystem 1: Full Design → Systems → Build cycle
├── Subsystem 2: Full Design → Systems → Build cycle
├── ...
└── Integration: Glue subsystems together
```

Each subsystem is **small enough to fit in one agent's head**.

---

## Summary

1. **Agents need specs that leave nothing to decide**
2. **Design docs are 85% (human-readable), Systems docs are 100% (agent-executable)**
3. **Different work types have different entry points**
4. **Small projects go flat, large projects use subsystems + milestones**
5. **Human role is architect/guide, not implementer**
6. **Quality gates with adversarial review catch ambiguity**
7. **Framework scales with AI capability improvements**
