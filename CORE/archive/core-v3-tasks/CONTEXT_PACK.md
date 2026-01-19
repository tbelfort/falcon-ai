# Task: Create Context Pack

Instructions for creating a Context Pack. Read after checking out a task that needs context gathering.

---

## Thinking Mode: Extended Thinking REQUIRED

**Use extended thinking (ultrathink) for all research and writing phases of context pack creation.**

Extended thinking is required for:
- Step 2.5 (Gemini breadth research) — Think deeply about what to ask
- Step 2.6 (Deep research) — Your own investigation
- Step 3 (Writing the Context Pack) — Synthesizing everything

Why: Context packs are the foundation for all downstream work. Shallow thinking produces shallow context packs, which produce shallow specs, which produce buggy implementations.

---

## What is a Context Pack?

A Context Pack is a **source-mapped pre-spec document** that extracts relevant architecture constraints and design context for a specific Linear issue. It allows spec writers to work with minimal context while maintaining accuracy.

**Key principle:** The Context Pack must be **source-mapped** — summaries with citations to internal doc sections, not just a summary.

**Critical principle:** The Context Pack is the spec agent's **sole source of context**. The spec agent will only read:
1. The Context Pack (your output)
2. `docs/architecture/ARCHITECTURE-simple.md` (standard for all agents)

**The spec agent reads NOTHING else.** No other docs, no code files, no pre-existing ai_docs. (Spec agents create NEW ai_docs via Gemini during their workflow — this rule applies to ai_docs that existed before spec work started.) Your job is to do all the reading and extract all relevant information into the Context Pack. Do NOT tell the spec agent to read files — that defeats the purpose.

---

## Prerequisites

- Issue is in **Todo** state
- No `has_spec` label (spec hasn't been written yet)

> **All issues start in Todo and get Context Pack work.** There's no label check — every issue in Todo needs a Context Pack.

---

## Step 1: Claim the Task

```bash
# Update status to Context Pack In Progress
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --state "Context Pack In Progress"

# Swap labels (remove agent_ready if present, add agent_working)
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --remove-label agent_ready
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label agent_working

# Comment to claim
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Starting Context Pack work."
```

---

## Step 1.5: Determine Component Type (REQUIRED)

Before researching, identify what type of component this issue affects:

### Component Type Lookup

| If issue affects... | Component Type | Tag in Context Pack |
|---------------------|----------------|---------------------|
| `packages/foundry/*` | foundry-package | `[TYPE: foundry-package]` |
| `packages/forge/*` | forge-stage | `[TYPE: forge-stage]` |
| `apps/*/weavers/` | weaver | `[TYPE: weaver]` |
| `apps/*/workers/` | worker | `[TYPE: worker]` |
| `apps/*/engine/` | engine | `[TYPE: engine]` |
| `apps/*/ux/` | ux | `[TYPE: ux]` |

**Add the tag to Section 0 of your Context Pack:**

```markdown
## 0) One-Sentence Goal

[TYPE: forge-stage]

<goal here>
```

This tag tells downstream agents which conditional checks apply.

---

## Step 2: Read Required Documents

### 2a. Read the Design Canon Index

```bash
# ALWAYS start here
cat docs/design_docs/INDEX.md
```

The Index tells you which documents are relevant for the component(s) touched by this issue.

### 2b. Read the Architecture Docs (Always Required)

```bash
cat docs/architecture/ARCHITECTURE-simple.md
cat docs/architecture/INDEX.md
cat docs/architecture/ARCHITECTURE.md
cat docs/architecture/LAYERS.md
```

Focus on:
- Non-negotiables (checklist for any work)
- Layering and dependency rules (import boundaries)
- Artifact/receipt/manifest constraints (use `docs/architecture/INDEX.md` to route to the right subdocs)

### 2c. Read Relevant Design Docs (Per Index)

Based on what the Index recommends for your component:
- Read design docs tagged for your component
- Note specific sections that constrain this work
- Record these for the Source Map section

### 2.3: Extract Project Non-Negotiables (MANDATORY)

**These constraints apply to ALL work.** Always include relevant ones in Section 3.

#### Non-Negotiables Checklist

From `docs/architecture/ARCHITECTURE-simple.md`:

| Rule | Applies To | Include in Context Pack? |
|------|------------|--------------------------|
| Forge packs must not import app code | forge-stage | Always if forge-stage |
| Forge packs must not import foundry-pipeline | forge-stage | Always if forge-stage |
| Foundry packages must not import apps | foundry-package | Always if foundry-package |
| Stages may only read/write declared artifacts | forge-stage | Always if forge-stage |
| Side effects must write receipt artifacts | forge-stage with effects | If stage has side effects |
| Multi-file outputs must use manifests | Any with multi-file | If multi-file outputs |

**Copy relevant rules verbatim into Section 3 (Architecture Constraints).**

### 2d. Check System Documentation

Scan the following doc indexes for relevant context:

```bash
# Check each index for relevant entries
cat docs/api/README.md           # API docs - relevant endpoints/contracts
cat docs/config/README.md        # Config - env vars, feature flags
cat docs/integrations/README.md  # External services
cat docs/troubleshooting/README.md  # Known issues, gotchas
cat docs/ops/INDEX.md            # Runbooks, procedures (ops uses INDEX.md)
cat docs/dbs/README.md           # Database schemas
```

If any index lists docs relevant to your issue:
- Read those docs
- Extract relevant constraints, gotchas, or context
- Include them in the Context Pack (don't just list the files)

---

## Step 2.5: Breadth Research (Gemini)

After reading internal docs, **delegate breadth research to Gemini**. Gemini explores the solution space — multiple approaches, third-party tools, trade-offs.

### Purpose: Explore Options

Gemini research is for **breadth** — understanding the landscape of solutions:
- What third-party tools exist for this problem?
- What are the trade-offs between approaches?
- What version compatibility issues exist?
- What combination issues occur with other libraries?

### What to Research

Based on what you learned in Step 2, identify:

1. **External libraries** that could be used (from architecture constraints or obvious needs)
2. **APIs or services** being integrated with
3. **Alternative approaches** (even if architecture docs suggest one, explore others for completeness)
4. **Version constraints** (Python 3.12.x, specific library versions)

### How to Research

Use the template at `.claude/CORE/TEMPLATES/gemini/research-gotchas.md`.

Ask targeted questions about specific concerns — gotchas, edge cases, version issues, library combination problems. Label findings as "(Source: Gemini research)" in the Context Pack.

### When to Skip

Skip Gemini research if:
- The task is purely internal (no external libraries/APIs)
- The task is documentation-only
- You already know the gotchas from internal docs

---

## Step 2.6: Deep Research (Opus — Your Own Investigation)

After Gemini's breadth research, **do your own depth research**. This is where you go deep on the approach that will actually be used.

### Purpose: Go Deep on the Chosen Approach

While Gemini explored options, now you:
- Deep-dive on the approach the architecture docs prefer (or the best option from Gemini's research)
- Find implementation-specific gotchas that Gemini might have missed
- Search for real-world problems and solutions

### Research Prompt Framework

**Use extended thinking** to work through these questions before searching:

#### 1. What Will Actually Be Built?

Think about:
- What does the architecture say the approach should be?
- Based on Gemini's research, which approach makes most sense?
- What specific technologies/patterns will be used?

#### 2. What Could Go Wrong?

For each technology/pattern, think about:
- **Edge cases:** What inputs could break this? What about empty, null, huge, unicode, concurrent?
- **Failure modes:** Network failures? Timeouts? Partial failures? Data corruption?
- **State problems:** Race conditions? Deadlocks? Stale data? Cache invalidation?
- **Scale issues:** What happens at 10x load? 100x? Memory pressure?

#### 3. What Are the Integration Points?

Think about:
- How does this connect to existing code?
- What existing patterns must be followed?
- What contracts (types, APIs, formats) must be respected?
- What could break if those contracts change?

#### 4. What Have Others Struggled With?

Search for:
- `<technology> gotchas site:stackoverflow.com`
- `<technology> production issues site:github.com`
- `<technology> <specific-feature> edge cases`
- `<library1> + <library2> compatibility issues`

### How to Research

1. **Use WebSearch** for real-world problems:
   ```
   python ast import visitor edge cases
   python ast parse syntax error handling
   <library> python 3.12 issues
   ```

2. **Look at the actual source** when relevant:
   - If the task involves existing code, read it to understand patterns
   - Look for TODOs, FIXMEs, or comments about known issues

3. **Check incident history** (if relevant):
   - `docs/incidents/` — Has this type of problem bitten us before?
   - `docs/troubleshooting/` — Are there known gotchas?

### What to Capture

Document your findings in Section 8.5 of the Context Pack:
- Label as "(Source: Opus research)" or "(Source: WebSearch)"
- Include specific search queries that were useful
- Note which problems are likely vs speculative

### When to Skip

Skip deep research only if:
- Gemini research was comprehensive AND the task is simple
- The task is purely documentation
- The approach is trivially simple (e.g., adding a config value)

---

## Step 2.7: Component-Specific Research

Based on component type, research additional areas:

### IF [TYPE: foundry-package] or [TYPE: forge-stage]

Research Pydantic patterns:
- Frozen model gotchas (tuple vs list for immutability)
- Validator patterns (field_validator vs model_validator)
- Cross-field validation patterns

### IF [TYPE: forge-stage]

Research artifact patterns:
- ArtifactStore protocol usage
- Receipt schema requirements
- Manifest containment rules

### IF [TYPE: worker] or [TYPE: engine] or [TYPE: weaver]

Research async patterns:
- Task cancellation handling
- Timeout patterns
- Blocking call detection

### IF [TYPE: ux]

Research React/TypeScript patterns:
- Existing component patterns in `apps/*/ux/`
- State management approach
- API integration patterns

---

## Step 3: Write the Context Pack

**Use extended thinking** to synthesize everything you've learned into a coherent context pack.

Use the template from `.claude/CORE/TEMPLATES/context-pack-template.md`.

### Before Writing: Think Through These Questions

Before you start writing, use extended thinking to process:

1. **What is the core problem?** (One sentence, no jargon)
2. **What are the hard constraints?** (Architecture rules that cannot be bent)
3. **What are the likely approaches?** (From Gemini breadth research)
4. **What is the best approach?** (Based on architecture docs + your judgment)
5. **What could go wrong?** (From your deep research)
6. **What will the spec agent need to know?** (Be their advocate)

### Guidelines

1. **Length cap:** No more than ~2 pages unless there's a BLOCKER question
2. **No design essays:** Extract constraints, don't redesign
3. **Extract, don't delegate:** Include the actual information the spec agent needs — do NOT list files for them to read or say "see file X for details"
4. **Separate facts vs guesses:**
   - Facts/constraints: source-mapped
   - Assumptions/hypotheses: clearly labeled
5. **Always include non-goals:** This is your anti-scope-creep vaccine
6. **Source Map is REQUIRED:** Every constraint must cite its source (for traceability, not for the spec agent to read)

### Section 8.5: Organizing Research Findings

The Context Pack template has a "Potential Gotchas" section (8.5). Organize it by source AND component type:

```markdown
## 8.5) Potential Gotchas (from research)

### General (All Components)
- <gotchas that apply regardless of type>

### From Gemini Breadth Research
- **Third-party tool trade-offs:** <summary of import-linter vs AST vs grep>
- **Version compatibility:** <findings about Python 3.12 + libraries>
- **Combination issues:** <library X + library Y problems>

### From Opus Deep Research
- **Implementation-specific:** <gotchas for the chosen approach>
- **Edge cases discovered:** <from WebSearch or code review>
- **Real-world issues:** <StackOverflow/GitHub findings with links>

### From Internal Docs
- **Known issues:** <from docs/incidents/ or docs/troubleshooting/>
- **Existing patterns:** <gotchas noted in code comments>

### IF [TYPE: foundry-package] or [TYPE: forge-stage] - Pydantic
- **Frozen model + mutable collections:** Pydantic `frozen=True` does NOT prevent `.append()` on list fields. Use `tuple[X, ...]` instead.
- **Hashability:** Frozen models with list fields cannot be used in sets/dict keys.
- **Cross-field validation:** Use `model_validator` for constraints spanning multiple fields.

### IF [TYPE: forge-stage] - Artifact Handling
- **Undeclared IO:** Any file read/write not in inputs/outputs violates architecture.
- **Receipt requirements:** Side effects without receipts will fail validation.

### IF [TYPE: worker/engine/weaver] - Async
- **Blocking in async:** Sync calls in async functions block the event loop.
- **Cancellation:** Unhandled cancellation can leave resources dangling.

### IF [TYPE: ux] - React/TypeScript
- <UX-specific gotchas from research>
```

### Quality Checklist

Before uploading, verify:
- [ ] One-sentence goal is actually one sentence
- [ ] Non-goals section is populated
- [ ] Architecture constraints cite specific sections (with line numbers if possible)
- [ ] Source Map has at least 2-3 entries
- [ ] Open questions are labeled BLOCKER or NON-BLOCKER
- [ ] Acceptance criteria are testable (given/when/then or checkable)
- [ ] **Breadth research done** — Gemini explored solution space (if external libs/APIs involved)
- [ ] **Deep research done** — You investigated the chosen approach for gotchas
- [ ] **Section 8.5 has both research sources** — Gemini + Opus findings clearly labeled
- [ ] **No file reading instructions** — Context Pack contains the info, not pointers to files
- [ ] **Code patterns included** — Actual code snippets, not just file paths

---

## Step 4: Upload to Linear

```bash
# Create the Context Pack as a Linear document
python "$REPO_ROOT/project-management/tools/linear.py" document create "CON-XXX Context Pack: <short title>" \
  --content-file /tmp/context-pack-CON-XXX.md \
  --project <project-name>
```

This returns a URL — save it for the comment.

**Note:** Context Packs are stored as Linear Documents only, not committed to the repo.

---

## Step 5: Update Linear

```bash
# Move to Context Pack In Review status
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --state "Context Pack In Review"

# Add has_context_pack label
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label has_context_pack

# Swap working → ready
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --remove-label agent_working
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label agent_ready

# Comment with Context Pack URL (REQUIRED format)
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack complete.

**Context Pack:** <Linear document URL>

**Summary:** <1-2 sentence summary of what the Context Pack covers>

**Open questions (BLOCKER):**
- <list any blockers that need human input, or 'None'>

Ready for review.

**Next steps:** Run \`/checkout CON-XXX\` to review the context pack."
```

---

## Step 6: Report to Human

Report: Context Pack URL, status, any BLOCKER questions, and next steps (`/checkout CON-XXX`).

---

## When to Add `human_input` Label

If you encounter BLOCKERs that cannot be resolved:

1. List them clearly in the Context Pack's "Open Questions" section
2. Add the `human_input` label
3. Comment explaining what decision is needed

```bash
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label human_input
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack blocked.

**Blockers requiring human decision:**
1. <blocker 1>
2. <blocker 2>

Please resolve these questions before spec work can begin."
```

---

## Common Mistakes to Avoid

1. **Listing files for the spec agent to read** — This defeats the entire purpose. Extract the information yourself and include it in the Context Pack. The spec agent should never need to read additional files.
2. **Saying "see X for details"** — Include the details. The Context Pack is the spec agent's only context source.
3. **Listing file paths for patterns without code** — The spec agent can't read files. Extract the actual code snippets and include them in the Context Pack.
4. **Skipping the Design Canon Index** — Always read it first
5. **Missing Source Map** — Every constraint needs a citation (for traceability)
6. **Scope creep in non-goals** — Be specific about what you're NOT doing
7. **Design essays** — Extract constraints, don't write the spec
8. **Empty acceptance criteria** — These become the spec's backbone
9. **Skipping system docs** — Check api/, config/, integrations/, troubleshooting/ for relevant context
