# Falcon Sprint 2 - Phase 5: Orchestration (State Machine Runner)

**Status**: Draft
**Depends On**: None at runtime for tests (use fakes). Integrates with Phase 1 (API), Phase 3 (agent infra), Phase 4 (invocation) when wired.
**Outputs Required By**: Phase 6, Phase 7
**Self-Contained**: Yes (this spec includes a context pack; no other docs are required)
**Reference Only (Optional)**: `docs/design/orchestration.md`, `docs/design/architecture.md`

---

## Handoff Prompt (Paste Into Fresh Model)

```text
You are implementing Falcon PM Sprint 2 Phase 5 (Orchestration: state machine runner) in the `falcon-ai` repo. Use ONLY `specs/falcon-sprint-2-phase-5.md` as the source of truth (its Context Pack contains the authoritative workflow stages, transitions, preset model/selection rules, and human gates). Implement a tick-based orchestrator that depends only on injected interfaces (repos/registry/invoker/clock), performs no IO, and ensure `npm test` passes.
```

## Context Pack (Read This, Then Implement)

### Repo Reality

- Node: `>= 20`, ESM, TS NodeNext
- Use `.js` in TS imports for local modules
- Orchestrator must be unit-testable without HTTP server, DB, git, or real LLMs

### Authoritative Workflow Stages

```ts
type IssueStage =
  | 'BACKLOG'
  | 'TODO'
  | 'CONTEXT_PACK'
  | 'CONTEXT_REVIEW'
  | 'SPEC'
  | 'SPEC_REVIEW'
  | 'IMPLEMENT'
  | 'PR_REVIEW'
  | 'PR_HUMAN_REVIEW'
  | 'FIXER'
  | 'TESTING'
  | 'DOC_REVIEW'
  | 'MERGE_READY'
  | 'DONE';
```

### Authoritative Stage Transitions

Same as Phase 0 (repeated here so this spec stands alone):

```ts
const STAGE_TRANSITIONS: Record<IssueStage, readonly IssueStage[]> = {
  BACKLOG: ['TODO'],
  TODO: ['CONTEXT_PACK'],
  CONTEXT_PACK: ['CONTEXT_REVIEW'],
  CONTEXT_REVIEW: ['SPEC', 'IMPLEMENT'],
  SPEC: ['SPEC_REVIEW'],
  SPEC_REVIEW: ['IMPLEMENT', 'SPEC'],
  IMPLEMENT: ['PR_REVIEW'],
  PR_REVIEW: ['PR_HUMAN_REVIEW'],
  PR_HUMAN_REVIEW: ['FIXER', 'TESTING'],
  FIXER: ['PR_REVIEW'],
  TESTING: ['DOC_REVIEW', 'IMPLEMENT'],
  DOC_REVIEW: ['MERGE_READY'],
  MERGE_READY: ['DONE'],
  DONE: [],
};
```

### Authoritative Preset Model

Presets define which stages run and which model/provider handles each stage.

```ts
interface PresetConfig {
  stages: IssueStage[];
  models: {
    default: string;
    overrides?: Partial<Record<IssueStage, string>>;
  };
  prReview?: {
    orchestrator: string;
    scouts: string[];
    judge: string;
  };
}
```

### Preset Selection (Authoritative)

When deciding what stages/models to run for an issue:
1. If `issue.presetId` is set, load that preset.
2. Else load the preset with `is_default = 1`.
3. Else fall back to preset name `full-pipeline`.

If no preset can be resolved, orchestration must stop and surface an error on the issue (do not guess).

### Human Gates (Non-Negotiable)

The following stages are human gates - the orchestrator MUST NOT automatically advance issues out of them:

| Stage | Reason |
|-------|--------|
| `PR_HUMAN_REVIEW` | Human must review PR findings and approve/dismiss |
| `MERGE_READY` | Merge requires explicit human action in Phase 5 (Phase 7 may add optional auto-merge) |

Implementation: `HUMAN_GATES = Set(['PR_HUMAN_REVIEW', 'MERGE_READY'])`

### Auto-Advance Behavior

The orchestrator automatically advances issues past certain "transient" stages without dispatching an agent:

| Stage | Auto-Advance? | Rationale |
|-------|---------------|-----------|
| `TODO` | Yes | Starting point for automation; immediately advances to first work stage |
| `BACKLOG` | No | Requires explicit human decision to prioritize |
| All others | No | Require agent work or are human gates |

Implementation: `AUTO_ADVANCE_STAGES = Set(['TODO'])`

### Stage-to-Status Mapping

Issues have both a `stage` (workflow position) and a `status` (simplified state for UI/queries). The orchestrator maintains this mapping:

| Stage | Status |
|-------|--------|
| BACKLOG | `backlog` |
| TODO | `todo` |
| DONE | `done` |
| All others | `in_progress` |

This mapping is authoritative. The `status` field MUST be updated atomically with `stage` transitions.

## Goal

Implement the orchestration engine that:
- moves issues through workflow stages based on preset configuration
- assigns agents (using registry interface) and dispatches stage work (using invoker interface)
- reacts to agent completion signals and transitions issues

This phase must be fully testable with in-memory repos and fake invokers.

---

## Hard Modularity Rules (Phase Gate)

1. Orchestrator core must not import Express or React.
2. Orchestrator must depend only on interfaces:
   - repos (issues, agents, runs)
   - agent registry
   - agent invoker
   - clock/sleep abstraction (for polling/backoff)
3. No git operations are performed directly by orchestration; those are delegated to Phase 3 adapters.

---

## Deliverables Checklist

- [ ] `src/pm/orchestrator/state.ts` (types for orchestration runtime state)
- [ ] `src/pm/orchestrator/runner.ts` (main loop)
- [ ] `src/pm/orchestrator/dispatcher.ts` (agent assignment decisions)
- [ ] `src/pm/orchestrator/workflow-executor.ts` (invoke stage work through invoker)
- [ ] `src/pm/orchestrator/preset-resolver.ts` (stage list + model mapping)
- [ ] `tests/pm/orchestrator/runner.test.ts`
- [ ] `tests/pm/orchestrator/presets.test.ts`

---

## Required Behavior (v1)

Based on the authoritative rules in this spec (Context Pack):

- Workflow stages (minimum):
  - BACKLOG -> TODO -> CONTEXT_PACK -> CONTEXT_REVIEW -> SPEC -> SPEC_REVIEW ->
    IMPLEMENT -> PR_REVIEW -> PR_HUMAN_REVIEW -> FIXER -> TESTING -> DOC_REVIEW ->
    MERGE_READY -> DONE

- Presets define:
  - which stages run (subset allowed)
  - model/provider selection per stage (opaque strings in Phase 5)

- Human gates:
  - Orchestrator must not auto-advance out of `PR_HUMAN_REVIEW`
  - Orchestrator must not auto-merge unless explicitly enabled (Phase 7)

---

## Runner Model

Implement a runner that can operate in two modes:

1. **Tick-based** (test mode): `await orchestrator.tick()` advances work deterministically.
2. **Looping** (dev mode): `orchestrator.start()` polls periodically.

The tick-based API is mandatory for unit tests and makes Phase 5 runnable without a server.

### Configuration Defaults

| Parameter | Default | Minimum | Rationale |
|-----------|---------|---------|-----------|
| `pollIntervalMs` | 2500ms | 100ms | Balance between responsiveness and system load |

The minimum poll interval is enforced to prevent runaway loops.

### Agent Selection Algorithm

Agent selection uses a **dual-status verification** pattern:

1. Query DB for agents matching `project_id`, `model`, and `status === 'idle'`
2. For each candidate, verify `AgentRegistry.getAgent(id).status === 'IDLE'`
3. Return first agent passing both checks, or `null`

**Rationale:** The in-memory registry tracks real-time agent state (may be updated before DB sync). Both sources must agree before assignment.

### Default Prompt Format

When `WorkflowExecutorOptions.promptBuilder` is not provided, the executor uses this format:

```
Stage: {STAGE}
<issue-title>Issue #{number}: {title}</issue-title>

<issue-description>
{description}
</issue-description>
```

User content (title, description) is wrapped in XML tags and HTML-escaped to prevent prompt injection attacks. Custom prompt builders can be injected for stage-specific formatting.

### Known Limitations (Phase 5)

| Limitation | Reason | Future Work |
|------------|--------|-------------|
| `resultSummary` hardcoded to "completed" | Agent invoker interface does not return execution summary | Phase 6/7 should extend invoker for observability |

---

## Test Plan

### `tests/pm/orchestrator/runner.test.ts`

Using in-memory repos + fake invoker:
- Given an issue in TODO with preset `full-pipeline`, runner assigns an agent and schedules CONTEXT_PACK
- When fake invoker "completes", issue advances to CONTEXT_REVIEW
- When reaching PR_HUMAN_REVIEW, runner stops advancing and sets `needsHumanAttention`

### `tests/pm/orchestrator/presets.test.ts`

- Preset stage lists are correct and stable
- Per-stage overrides resolve correctly

---

## How To Run (Phase 5)

```bash
npm test
```

Optional: provide a demo script that runs a single issue through stages using the fake invoker and logs transitions.
