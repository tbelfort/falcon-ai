# Documentation System Guide

This guide explains how the `docs/` directory structure works in falcon-ai projects, and when each type of documentation is appropriate.

---

## The Three-Tier Structure

```
docs/
├── design/    # Fluid, exploratory, human-agent collaboration space
├── systems/   # Verified source of truth for implementation
└── support/   # Process guides, how-tos, reference material
```

### What Agents Reference During Implementation

**Falcon workflow agents (todo → context pack → spec → implement) only reference:**
- `docs/systems/` — Verified architecture, APIs, schemas
- `docs/support/` — Process guides and reference material

**They deliberately ignore `docs/design/`.**

---

## docs/design/ — The Exploration Space

**Purpose:** Where humans and agents collaborate to figure out *what* to build.

**Characteristics:**
- Deliberately rough and incomplete
- May contain contradictions between documents
- Fluid — changes frequently as understanding evolves
- Represents thinking-in-progress, not decisions made

**Who uses it:**
- Humans working with agents during design phases (Stages 0-2)
- Design-focused agents helping explore options and tradeoffs

**What belongs here:**
- Vision documents
- Use case explorations
- Technical design drafts
- Option comparisons
- Subsystem breakdowns for large projects

**Example contents:**
```
docs/design/
├── vision.md              # Why are we building this?
├── use-cases.md           # How will it be used?
├── technical.md           # Architecture exploration
├── components.md          # Component breakdown
└── subsystems/            # For large projects
    ├── auth/
    └── rendering/
```

**Key insight:** Design docs capture the *journey* of figuring things out. Contradictions are expected — they represent options not yet resolved.

See [how_to_design.md](../design/how_to_design.md) for the full design methodology.

---

## docs/systems/ — The Source of Truth

**Purpose:** Verified, authoritative documentation that implementation agents can trust.

**Characteristics:**
- Precise and unambiguous
- Internally consistent (no contradictions)
- Marked `[DRAFT]` until verified against reality
- `[DRAFT]` removed after implementation confirms accuracy

**Who uses it:**
- Context Pack builders extracting relevant architecture
- Spec agents writing implementation specifications
- Implementation agents as reference during coding
- Anyone needing to understand how the system *actually* works

**What belongs here:**
- Architecture documents (verified)
- API specifications
- Data schemas
- Interface contracts
- Component boundaries

**Example contents:**
```
docs/systems/
├── architecture.md        # Overall system design
├── api/
│   ├── rest-endpoints.md
│   └── graphql-schema.md
├── data/
│   └── database-schema.md
└── components/
    ├── auth-service.md
    └── event-bus.md
```

**The DRAFT lifecycle:**
1. Document written during design phase → marked `[DRAFT]`
2. Implementation built from specs (which reference the draft)
3. After implementation, verify doc matches reality
4. Remove `[DRAFT]` — document is now authoritative

---

## docs/support/ — Process & Reference

**Purpose:** Guides for how to work within the system, not descriptions of the system itself.

**Characteristics:**
- Stable, rarely changes
- Process-focused rather than architecture-focused
- Helps agents and humans understand *how to work*

**Who uses it:**
- Agents needing to understand workflows
- Humans onboarding to the project
- Anyone needing reference material

**What belongs here:**
- This guide
- Workflow documentation
- Tool usage guides
- Conventions and standards
- Troubleshooting guides

---

## When to Use Each

| You want to... | Use |
|----------------|-----|
| Explore what to build | `docs/design/` |
| Understand how something works (verified) | `docs/systems/` |
| Learn how to do something | `docs/support/` |
| Write a context pack | Extract from `docs/systems/` |
| Write a spec | Reference `docs/systems/` via context pack |
| Implement a feature | Trust `docs/systems/` + spec |
| Debug why design feels wrong | Review `docs/design/` for contradictions |

---

## The Design → Systems Flow

```
docs/design/          docs/systems/
     │                     ▲
     │ (human resolves     │
     │  contradictions,    │
     │  makes decisions)   │
     ▼                     │
  Decision ───────────────►│
  made                     │
                      Written as [DRAFT]
                           │
                      Implementation
                           │
                      Verification
                           │
                      [DRAFT] removed
```

**Design docs don't become systems docs.** Instead:
1. Design exploration surfaces options and tradeoffs
2. Human makes decisions (possibly with agent help)
3. Decisions are written fresh into `docs/systems/` as `[DRAFT]`
4. Implementation happens
5. Systems docs verified and finalized

---

## For Agents: Key Rules

1. **Never reference `docs/design/` during implementation workflows.** These docs may contradict each other or be outdated.

2. **Trust `docs/systems/` as authoritative.** If something in systems docs seems wrong during implementation, flag it — don't silently deviate.

3. **Use `docs/support/` for process questions.** How to write a context pack, how to structure a spec, etc.

4. **During design phases, `docs/design/` contradictions are features, not bugs.** They represent unresolved decisions that need human input.

---

## For Humans: Key Rules

1. **Keep design docs rough.** Don't over-polish — the goal is exploration, not publication.

2. **Resolve contradictions before moving to systems docs.** Design is where disagreements live; systems is where decisions live.

3. **Verify systems docs after implementation.** The `[DRAFT]` marker exists for a reason.

4. **Update systems docs when reality changes.** If you refactor something, update the systems doc or it becomes a lie.
