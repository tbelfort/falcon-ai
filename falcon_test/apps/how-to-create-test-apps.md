# How to Create Test Apps for Falcon Validation

This guide explains how to set up test apps that properly exercise the Falcon guardrail system.

---

## Workflow Overview

Test app creation follows a two-phase workflow:

1. **Template Phase** - Create app templates in `falcon_test/apps/xxx/`
2. **Deployment Phase** - Copy templates to test folders for actual runs

```
falcon_test/apps/app1/           # Template (canonical source)
├── docs/                        # Complete documentation
└── tasks/
    ├── task1.md                 # Task 1 Linear issue content
    ├── task2.md                 # Task 2 Linear issue content
    └── ...

↓ Deploy to test folder ↓

~/Projects/falcon-tests/app1_treatment_1/    # Deployed instance
├── docs/                        # Copied from template
├── .falcon/                     # falcon init
├── .claude/                     # falcon init
└── .git/                        # git init
```

This separation ensures:
- Templates can be refined without affecting running tests
- Multiple test runs use identical starting docs
- Task breakdowns are version-controlled with docs

---

## Why This Matters

Falcon injects warnings into Context Pack and Spec agents. For this to work, the test apps need:

1. **Real docs/** - Context Pack agent extracts from architecture docs
2. **Design decisions** - Constraints that can be violated (and caught)
3. **Security-relevant choices** - Areas where Falcon baselines apply
4. **Enough complexity** - Multiple tasks, not trivial one-file scripts

**Empty repos with just a Linear issue don't work.** The Context Pack agent has nothing to extract.

---

## Template Structure

Templates live in `falcon_test/apps/` within the falcon-ai repo:

```
falcon_test/apps/app1/
├── docs/
│   ├── design/
│   │   ├── INDEX.md           # Navigation and architecture summary
│   │   ├── vision.md          # Why build this? What problem?
│   │   ├── use-cases.md       # Who uses it? How?
│   │   ├── technical.md       # Architecture decisions (AD1, AD2...)
│   │   └── components.md      # Module breakdown, dependencies
│   └── systems/
│       ├── architecture/
│       │   └── ARCHITECTURE-simple.md   # The canonical architecture
│       ├── database/
│       │   └── schema.md      # Exact schema, constraints
│       ├── cli/
│       │   └── interface.md   # Command specs, args, outputs
│       └── errors.md          # Error contract, exit codes
└── tasks/
    ├── task1.md               # Task 1 - exact Linear issue content
    ├── task2.md               # Task 2 - exact Linear issue content
    ├── task3.md               # Task 3 - exact Linear issue content
    └── task4.md               # Task 4 - exact Linear issue content
```

---

## Deployed Test Folder Structure

When deploying a test, copy docs from template and initialize:

```
~/Projects/falcon-tests/app{N}_{treatment|control}_{run}/
├── docs/                      # Copied from falcon_test/apps/appN/docs/
├── .falcon/                   # Falcon config (from `falcon init`)
├── .claude/                   # Claude commands/agents
└── .git/                      # Git repo
```

---

## Design Docs (85% Specificity)

Design docs are human-readable and capture the "why":

### vision.md
- Problem statement
- Target user persona
- Solution overview
- Non-goals (what we're NOT building)
- Success criteria

### use-cases.md
- 5-7 concrete user scenarios
- Actor, flow, success, failure modes
- Named (UC1, UC2...) for reference

### technical.md
- Technology choices with rationale
- Architecture decisions (AD1, AD2...) with rationale
- Data model overview
- Security considerations
- Performance targets

### components.md
- Module listing with purposes
- Public interfaces (function signatures)
- Dependency graph
- What each component does and doesn't do

---

## Systems Docs (100% Specificity)

Systems docs are agent-executable. **Leave NOTHING to decide.**

### ARCHITECTURE-simple.md
- Layer diagram
- Data flow
- Entry points
- Rules that MUST be followed

### schema.md (if database)
- Exact CREATE TABLE statements
- Column types, constraints, defaults
- Index definitions
- Example data

### interface.md (if CLI/API)
- Every command with exact syntax
- Every argument with type, default, constraints
- Every output format with examples
- Every exit code with meaning

### errors.md
- Exception hierarchy
- Exit code mapping
- Error message templates
- What NOT to expose in errors

---

## Designing for Falcon Testing

Include areas where Falcon baselines can help:

### SQL Injection Surface (B01: Parameterized Queries)
- User input flows into database queries
- Multiple query points (search, filter, insert)

### Input Validation (B02: Validate External Input)
- String length limits
- Numeric bounds
- Path validation

### Sensitive Data (B03: Don't Log Secrets)
- Credentials, API keys, PII that could leak
- Logging that could expose data

### Authorization (B04: Explicit Authorization)
- Operations that should be protected
- Privilege boundaries

### Network (B05, B06: Timeouts, Retries)
- External API calls
- Retry-able operations

### Config Security (B11: Least Privilege)
- Database credentials
- File permissions

---

## Breaking Into Tasks

After docs are complete, break into 3-5 task files in `tasks/`:

**Good task boundaries:**
- Each task is 1-2 days of work
- Each task has clear inputs and outputs
- Tasks can be reviewed independently
- Dependencies are explicit

**Example for a CLI tool:**
1. **task1.md: Data Layer** - Schema, models, validation, exceptions
2. **task2.md: CLI Framework** - Argument parsing, routing, error handling
3. **task3.md: Core Commands** - Write operations (init, add, update)
4. **task4.md: Export** - CSV generation, file handling

**Anti-patterns:**
- Tasks so small they're trivial (add one function)
- Tasks so large they're a whole feature
- Tasks with hidden dependencies
- Tasks that require reading other tasks to understand

---

## Task File Format

Each task file (`tasks/taskN.md`) contains the exact content that will become a Linear issue:

```markdown
# Task N: Short Title

Brief description of what this task accomplishes.

## Context

Read before starting:
- `docs/systems/xxx.md` - What to read first
- `docs/design/xxx.md` - Additional context

## Scope

- [ ] Specific deliverable 1
- [ ] Specific deliverable 2
- [ ] Tests for above

## Constraints

- **AD1**: Reference architecture decisions
- **S1**: Reference security rules from ARCHITECTURE-simple.md
- Must follow X pattern

## Tests Required

- Test case 1
- Test case 2
- Test error conditions

## Not In Scope

- Things explicitly excluded (handled in other tasks)

## Acceptance Criteria

\`\`\`bash
# Example command and expected output
python -m myapp command --arg value
# Output: Expected output
# Exit: 0
\`\`\`
```

**Key points:**
- Tasks reference docs/ sections, not duplicate content
- Constraints cite specific AD/S identifiers
- Acceptance criteria are concrete, runnable examples
- "Not In Scope" prevents scope creep

---

## Linear Issue Creation

When deploying a test, create Linear issues from task files:

```
Title: [test_id] {Task Title from task file}
Team: FALT
Labels: falcon_test, treatment|control, app_N, run_N

Description: (copy from tasks/taskN.md)
```

**Important:**
- Issue description comes directly from task file content
- The description does NOT contain the full spec - it references docs/
- Agent should NOT know this is a test (no "falcon_test" in description)

---

## Checklist: Creating Templates

- [ ] docs/design/ complete (INDEX, vision, use-cases, technical, components)
- [ ] docs/systems/ complete (architecture, schema, interface, errors)
- [ ] All architecture decisions have ADx identifiers
- [ ] Security rules have Sx identifiers in ARCHITECTURE-simple.md
- [ ] Security-relevant constraints are explicit
- [ ] Cross-reference check: all docs consistent with each other
- [ ] tasks/ contains 3-5 task files with Linear issue content
- [ ] Each task references specific docs/ sections
- [ ] Each task has concrete acceptance criteria

## Checklist: Deploying Tests

- [ ] Create test folder: `~/Projects/falcon-tests/appN_treatment|control_M/`
- [ ] Copy docs/ from template: `cp -r falcon_test/apps/appN/docs/ target/docs/`
- [ ] Initialize git: `git init && git add . && git commit -m "Initial docs"`
- [ ] Initialize Falcon: `falcon init` (if treatment) or skip (if control)
- [ ] Create Linear issues from tasks/taskN.md files
- [ ] Set issue labels: falcon_test, treatment|control, app_N, run_M

---

## Example: Warehouse CLI App

See `falcon_test/apps/app1/` for a complete template example:
- `docs/` - Complete design and systems documentation
- `tasks/` - 4 task files ready for Linear issue creation
