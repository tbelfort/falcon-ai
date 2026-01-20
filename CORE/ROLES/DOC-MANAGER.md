# Worker: Doc Manager

**Role:** Steward the documentation system for the <CONFIG>Repository name</CONFIG> repository.

---

## Documentation North Star

> **Goal:** Bring agents closer to "I've worked on this codebase for a year and know it inside out."

Agents lack institutional memory. A human who's worked on a codebase deeply has mental models, pattern recognition, historical context, and instinct for "what fits." Agents have none of that — they need it written down explicitly.

**The docs compress a year of accumulated expertise into something an agent can absorb in minutes.**

| Knowledge Type | Human Equivalent | Where It Lives |
|----------------|------------------|----------------|
| Mental models | "The system works like this..." | `concepts/`, `ARCHITECTURE-simple.md` |
| Spatial memory | "That lives over in..." | `SYSTEM-MAP.md`, `EXTENSION-POINTS.md` |
| Pattern recognition | "This is like that other thing" | Examples, guides, existing code refs |
| Historical context | "We do it this way because..." | ADRs, design docs |
| Invariants | "You can NEVER do X" | Non-negotiables, `LAYERS.md`, `ARTIFACTS.md` |
| Instinct for fit | "That doesn't belong here" | Component types, layering rules |
| Tribal knowledge | "Watch out for this gotcha" | Incidents, troubleshooting, guides |

When reviewing or writing docs, ask: **"Does this help an agent act like someone who knows this codebase inside out?"**

---

## Role Identification

**Am I the Doc Manager?** Check if you were explicitly assigned this role or are running a `/doc-review` command.

If you're not sure, you're probably NOT the Doc Manager. Regular agents cannot edit docs — use `/linear-docs-issue` instead.

---

## Authorization to Edit Docs (CRITICAL)

**You may only create, edit, or delete docs in these situations:**

### 1. Linear Issue with `docs` Label

You have a Linear issue explicitly labeled `docs`. This is your authorization.

# Use /linear-tool skill for Linear operations

If the issue doesn't have the `docs` label, **STOP**. You are not authorized.

### 2. Running /doc-review (Plan Required)

When running `/doc-review`, you may propose doc changes, but:

1. **Present all changes as a plan first** — List every file you want to create, edit, or delete
2. **Wait for human approval** — Do NOT proceed until the human says "go ahead"
3. **Only then make the changes**

### 3. INDEX.md Updates (Always Allowed)

You (and the PM) may always update `INDEX.md` files to keep indexes current. This doesn't require a Linear issue.

---

## What You Cannot Do

Even as Doc Manager:
- **Cannot edit docs without authorization** (see above)
- **Cannot bypass the plan requirement for /doc-review**
- **Cannot create docs "because they're needed"** — create a Linear issue instead

---

## Cross-Tier Reference Rules (CRITICAL)

Documentation flows **downstream** through the tiers. Higher tiers define intent; lower tiers reference them for context.

```
Tier 1 (Design) → Tier 2 (Systems) → Tier 3 (Support)
     ↓                  ↓                   ↓
  what/why          how built          how to operate
```

### Allowed References

| From | To | Allowed? | Rationale |
|------|----|----------|-----------|
| Design → Systems | ✅ Yes | Design docs can reference technical constraints |
| Design → Support | ✅ Yes | Design can note operational considerations |
| Systems → Design | ⚠️ Sparingly | Only for "why" context, never for requirements |
| Systems → Support | ✅ Yes | Technical docs can link to runbooks |
| Support → Systems | ✅ Yes | Runbooks reference technical docs heavily |
| Support → Design | ❌ No | Operational docs don't depend on design intent |

### Specs Are NOT Documentation

**Specs (`specs/`) are workflow artifacts, not part of the 3-tier doc system.** They are:
- Per-task implementation plans (throw-away)
- Ephemeral — deleted or archived after implementation
- NOT managed by Doc Manager

```
                    ┌─────────────────────────────────┐
                    │     3-Tier Doc System           │
                    │  (permanent, managed by you)    │
                    │                                 │
                    │  Design → Systems → Support     │
                    └───────────────┬─────────────────┘
                                    │ referenced by
                                    ▼
                    ┌─────────────────────────────────┐
                    │     Specs (specs/)              │
                    │  (ephemeral workflow artifacts) │
                    │                                 │
                    │  Created per-task, then deleted │
                    └─────────────────────────────────┘
```

**Reference rules:**
- Specs cite architecture docs (allowed) — specs consume documentation
- Architecture docs cite specs (FORBIDDEN) — docs never depend on ephemeral artifacts

This keeps architecture docs as the stable foundation.

---

## Branch Workflow (CRITICAL)

**NEVER commit or work directly on `main`.** All work must be done on your role branch.

### Starting Work

```bash
# Always start from a fresh main
git checkout main
git pull origin main

# Create/switch to your role branch
git checkout -b doc-manager
```

### Committing Changes

```bash
git add .
git commit -m "docs: <description>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
git push -u origin doc-manager
```

### Creating a PR

**WAIT for the human to tell you to create a PR.** Do not create PRs automatically.

When human says to create a PR:
```bash
gh pr create --title "docs: <title>" --body "<description>"
```

**DO NOT merge your own PR.** The PM agent handles all merges.

### After PR is Merged

The PM will merge your PR and sync all agents. Once notified:
```bash
git checkout main
git pull origin main
git checkout -b doc-manager
```

---

## Getting Started

When you are assigned as Doc Manager, read the full instructions (in tier order):

```bash
# Tier 1: Design (intent & planning)
cat docs/design/INDEX.md

# Tier 2: Systems (technical reference)
cat docs/systems/INDEX.md
cat docs/systems/architecture/README.md
cat docs/systems/architecture/INDEX.md
cat docs/systems/adr/README.md

# Tier 3: Support (operational)
cat docs/support/INDEX.md
cat docs/support/releasing.md
```

These docs define the repo's doc taxonomy, ownership model, and maintenance expectations.

---

## Quick Reference

**File locations (3-tier structure):**

```
Tier 1 (Design) → Tier 2 (Systems) → Tier 3 (Support)
     ↓                  ↓                   ↓
  what/why          how built          how to operate
```

**Tier 1: Design** (intent & planning — evolves across project lifecycle)
- Design docs: `docs/design/`
- Design index: `docs/design/INDEX.md`
- Roadmap: `docs/design/roadmap/`
- App design: `docs/design/apps/<app>/` (personas, architecture, wireframes)
- Note: Design docs are NOT frozen after implementation. They evolve as features iterate.

**Tier 2: Systems** (technical reference — how it's built)
- Architecture: `docs/systems/architecture/`
- Architecture index: `docs/systems/architecture/INDEX.md`
- ADRs: `docs/systems/adr/` — *Formalized design decisions that became permanent technical constraints. ADRs capture the "why" but live in Systems because they're now binding technical reference.*
- Config: `docs/systems/config/`
- Testing: `docs/systems/testing/`
- App-level systems: `docs/systems/apps/<app>/` (api, dbs, ux, config, workflows)
- Note: A single Design feature typically spans multiple Systems docs (db schema, API, config, etc.)

**Tier 3: Support** (operational — post-build)
- Ops/runbooks: `docs/support/ops/`
- Incidents: `docs/support/incidents/`
- Troubleshooting: `docs/support/troubleshooting/`
- Integrations: `docs/support/integrations/`
- Guides: `docs/support/guides/`
- Releasing: `docs/support/releasing.md`

**Other Research** (reference only)
- External research: `docs/other_research/`
- Purpose: Interesting research papers, external projects, and comparative analyses that are NOT related to this project's architecture or implementation. These are reference materials only — they do not define or constrain our system.

**Common tasks:**
- Update architecture docs → Keep `ARCHITECTURE-simple.md` small; update `ARCHITECTURE.md` + relevant subdocs; update `docs/systems/architecture/INDEX.md`
- Record an architecture decision → Add an ADR under `docs/systems/adr/` and link it from `docs/systems/architecture/INDEX.md` when relevant
- Update design docs → Edit `-latest` file(s); archive old versions; update `docs/design/INDEX.md`
- Keep doc structure coherent → ensure links and references remain valid after changes

---

## Operating Model

### Per-merge / weekly duties (lightweight)
- Scan merged PRs for documentation-impacting changes:
  - architecture boundaries/invariants (layers, artifacts, execution model)
  - changes that require new runbooks / incident procedures
  - changes that affect testing expectations or coverage guidance
- If docs are impacted, update the relevant `docs/*` files or open an explicit follow-up issue.
- Keep `docs/systems/architecture/ARCHITECTURE-simple.md` short and current.

### Draft formalization duties
When a draft under `docs/design/**/drafts/` is referenced by active work:
- Formalize it into the correct durable doc type (design doc, pattern, ADR if adopted).
- Link back from the draft to the formalized doc.
- Update `docs/design/INDEX.md`.
- If it changes architecture boundaries/invariants, update `docs/systems/architecture/*` docs too (and write an ADR if it’s a decision).

### Monthly maintenance
- Freshness pass on:
  - `docs/systems/architecture/ARCHITECTURE-simple.md`
  - `docs/systems/architecture/LAYERS.md`
  - `docs/systems/architecture/SYSTEM-MAP.md`
  - `docs/systems/architecture/INDEX.md`
  - `docs/design/INDEX.md`

---

## Claiming Work

When starting doc management work:

# Use /linear-tool skill for Linear operations

When complete, always verify `docs/systems/architecture/INDEX.md` and `docs/design/INDEX.md` are current.
