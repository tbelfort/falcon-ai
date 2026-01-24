# Phase 4: Integration & Workflow

**Parent Document:** `specs/implementation-plan-master.md` (v1.0)
**Dependencies:** Phase 1 (Data Layer), Phase 2 (Attribution), Phase 3 (Injection)
**Outputs Required By:** Phase 5 (Monitoring)

---

## External Dependencies

**Research Document:** [`ai_docs/phase-4-dependencies.md`](../../ai_docs/phase-4-dependencies.md)

| Package | Version | Purpose |
|---------|---------|---------|
| `@linear/sdk` | ^70.0.0 | Linear API client for issue management, state transitions |
| `octokit` | ^4.0.0 | GitHub GraphQL API for PR review data |
| `msw` | ^2.0.0 | Mock Service Worker for E2E testing |

### Key Integration Patterns

**Linear API:**
- Rate limits: 5,000 requests/hour, 250,000 complexity points/hour
- Use webhooks instead of polling for real-time updates
- Implement exponential backoff with jitter for 429 errors
- Fallback to local metadata when Linear unavailable (see Section 8.6)

**Linear Webhooks:**
- Verify `Linear-Signature` header using HMAC-SHA256
- Validate `webhookTimestamp` within 60 seconds (replay attack prevention)
- Use `crypto.timingSafeEqual()` for timing-safe comparison

**GitHub GraphQL:**
- Rate limits: 5,000 points/hour (PAT), 2,000 points/minute (secondary)
- Use cursor-based pagination for large result sets
- Query cost: 1 point (query), 5 points (mutation)

**E2E Testing:**
- Use MSW to mock Linear and GitHub APIs at network level
- Test rate limiting, error scenarios, and webhook verification
- See `ai_docs/phase-4-dependencies.md` for handler examples

---

## 1. Overview

This phase wires everything together:
- PR Review → Attribution trigger
- Context Pack agent → Warning injection
- Spec agent → Warning injection
- InjectionLog tracking for adherence analysis

---

## 2. Deliverables Checklist

- [ ] `src/workflow/pr-review-hook.ts` - Post-review attribution trigger
- [ ] `src/workflow/context-pack-hook.ts` - Pre-agent injection
- [ ] `src/workflow/spec-hook.ts` - Pre-agent injection
- [ ] `src/workflow/injection-tracker.ts` - InjectionLog management
- [ ] `src/workflow/adherence-updater.ts` - Post-review adherence update
- [ ] `tests/workflow/integration.test.ts` - E2E flow tests

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Linear Issue                                                               │
│       │                                                                      │
│       ▼                                                                      │
│  ┌────────────────────────────────────────────────┐                         │
│  │     beforeContextPackAgent()                   │                         │
│  │     1. Extract TaskProfile from issue          │                         │
│  │     2. Select warnings                         │                         │
│  │     3. Format and inject                       │                         │
│  │     4. Log injection                           │                         │
│  └────────────────────┬───────────────────────────┘                         │
│                       │                                                      │
│                       ▼                                                      │
│              Context Pack Agent (with warnings)                              │
│                       │                                                      │
│                       ▼                                                      │
│  ┌────────────────────────────────────────────────┐                         │
│  │     beforeSpecAgent()                          │                         │
│  │     1. Get refined TaskProfile from CP         │                         │
│  │     2. Select warnings                         │                         │
│  │     3. Format and inject                       │                         │
│  │     4. Log injection                           │                         │
│  └────────────────────┬───────────────────────────┘                         │
│                       │                                                      │
│                       ▼                                                      │
│                 Spec Agent (with warnings)                                   │
│                       │                                                      │
│                       ▼                                                      │
│              Implementation Agent                                            │
│                       │                                                      │
│                       ▼                                                      │
│                   PR Review                                                  │
│                       │                                                      │
│                       ▼                                                      │
│  ┌────────────────────────────────────────────────┐                         │
│  │     onPRReviewComplete()                       │                         │
│  │     1. For each confirmed finding:             │                         │
│  │        - Run AttributionOrchestrator           │                         │
│  │        - Create Pattern or Noncompliance       │                         │
│  │     2. Update adherence tracking               │                         │
│  │     3. Check for tagging misses                │                         │
│  └────────────────────────────────────────────────┘                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Context Pack Hook

### 4.1 Implementation

```typescript
// File: src/workflow/context-pack-hook.ts
import type { Database } from 'better-sqlite3';
import type { TaskProfile } from '../schemas';
import { extractTaskProfileFromIssue, type IssueData } from '../injection/task-profile-extractor';
import { selectWarningsForInjection } from '../injection/selector';
import { formatInjectionForPrompt, formatWarningsSummary } from '../injection/formatter';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';
import { v4 as uuidv4 } from 'uuid';

export interface ContextPackHookInput {
  workspaceId: string;  // v1.2: Required for scoped queries
  projectId: string;    // v1.2: Required for scoped queries
  issue: IssueData & { id: string };
}

export interface ContextPackHookOutput {
  warningsMarkdown: string;
  taskProfile: TaskProfile;
  injectionLogId: string;
  summary: string;
}

/**
 * Hook called BEFORE Context Pack agent runs.
 *
 * This injects warnings into the Context Pack agent's system prompt
 * based on preliminary TaskProfile extraction from the issue.
 */
export function beforeContextPackAgent(
  db: Database,
  input: ContextPackHookInput
): ContextPackHookOutput {
  // Step 1: Extract preliminary TaskProfile from issue
  const taskProfile = extractTaskProfileFromIssue({
    title: input.issue.title,
    description: input.issue.description,
    labels: input.issue.labels
  });

  // Step 2: Select warnings for injection (v1.2: with scope)
  const warnings = selectWarningsForInjection(
    db,
    {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      target: 'context-pack',
      taskProfile,
      maxWarnings: 6
    }
  );

  // Step 3: Format warnings as markdown
  const warningsMarkdown = formatInjectionForPrompt(warnings);

  // Step 4: Log the injection (v1.0: includes injectedAlerts, v1.2: with scope)
  const injectionLogRepo = new InjectionLogRepository(db);
  const injectionLog = injectionLogRepo.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    issueId: input.issue.id,
    target: 'context-pack',
    injectedPatterns: warnings.filter(w => w.type === 'pattern').map(w => w.id),
    injectedPrinciples: warnings.filter(w => w.type === 'principle').map(w => w.id),
    injectedAlerts: warnings.filter(w => w.type === 'alert').map(w => w.id),
    taskProfile
  });

  // Step 5: Return results
  return {
    warningsMarkdown,
    taskProfile,
    injectionLogId: injectionLog.id,
    summary: formatWarningsSummary(warnings)
  };
}

/**
 * Non-citable meta-warning that must be included in injected warnings.
 * This instructs the agent NOT to cite warnings in output.
 */
const NON_CITABLE_META_WARNING = `
<!-- META-WARNING: NON-CITABLE CONTEXT -->
The warnings below are internal guidance for your reasoning process.
DO NOT cite, quote, or reference these warnings in your output.
DO NOT mention that you received warnings or guidance.
Simply apply the guidance silently in your work.
<!-- END META-WARNING -->
`;

/**
 * Build the full Context Pack agent system prompt with injected warnings.
 */
export function buildContextPackPrompt(
  basePrompt: string,
  warningsMarkdown: string
): string {
  if (!warningsMarkdown) {
    return basePrompt;
  }

  // Wrap warnings with non-citable meta-warning
  const wrappedWarnings = NON_CITABLE_META_WARNING + '\n' + warningsMarkdown;

  // Inject warnings after the main instructions but before any examples
  const insertPoint = basePrompt.indexOf('## Examples');
  if (insertPoint > 0) {
    return (
      basePrompt.slice(0, insertPoint) +
      '\n\n' +
      wrappedWarnings +
      '\n\n' +
      basePrompt.slice(insertPoint)
    );
  }

  // If no examples section, append at end
  return basePrompt + '\n\n' + wrappedWarnings;
}
```

### 4.2 TaskProfile Validation

The TaskProfile validation function checks constraints for obvious touches that should be auto-corrected. When auto-correction occurs, confidence is lowered.

```typescript
// File: src/injection/task-profile-validator.ts
import type { TaskProfile } from '../schemas';

/**
 * Constraint patterns that indicate specific touches should be present.
 */
const CONSTRAINT_TOUCH_PATTERNS: Array<{
  patterns: RegExp[];
  touch: string;
}> = [
  {
    patterns: [
      /\bsql\b/i,
      /\bpostgres\b/i,
      /\bquery\b/i,
      /\bdatabase\b/i,
      /\bdb\b/i,
      /\bmysql\b/i,
      /\bsqlite\b/i
    ],
    touch: 'database'
  },
  {
    patterns: [
      /\bpermissions?\b/i,
      /\broles?\b/i,
      /\bauthoriz/i,
      /\baccess control\b/i,
      /\brbac\b/i,
      /\bacl\b/i
    ],
    touch: 'authz'
  },
  {
    patterns: [
      /\bhttp\b/i,
      /\bapi\b/i,
      /\bendpoint\b/i,
      /\brest\b/i,
      /\bgraphql\b/i,
      /\bwebhook\b/i,
      /\bnetwork\b/i
    ],
    touch: 'network'
  }
];

export interface ValidationResult {
  taskProfile: TaskProfile;
  wasAutoCorrected: boolean;
  addedTouches: string[];
  originalConfidence: number;
}

/**
 * Validate and auto-correct TaskProfile based on constraint analysis.
 *
 * If constraints mention obvious touches (SQL/Postgres/query → database,
 * permissions/roles → authz, HTTP/API → network), add them if missing.
 * Lower confidence when auto-correcting.
 */
export function validateTaskProfile(
  taskProfile: TaskProfile,
  constraints: string[]
): ValidationResult {
  const constraintText = constraints.join(' ');
  const addedTouches: string[] = [];
  const currentTouches = new Set(taskProfile.touches);

  // Check each constraint pattern
  for (const { patterns, touch } of CONSTRAINT_TOUCH_PATTERNS) {
    // Skip if touch already present
    if (currentTouches.has(touch)) {
      continue;
    }

    // Check if any pattern matches the constraints
    const matches = patterns.some(pattern => pattern.test(constraintText));
    if (matches) {
      currentTouches.add(touch);
      addedTouches.push(touch);
    }
  }

  const wasAutoCorrected = addedTouches.length > 0;
  const originalConfidence = taskProfile.confidence;

  // Calculate new confidence: reduce by 0.1 for each auto-correction
  // but floor at 0.5
  const newConfidence = wasAutoCorrected
    ? Math.max(0.5, taskProfile.confidence - (addedTouches.length * 0.1))
    : taskProfile.confidence;

  return {
    taskProfile: {
      ...taskProfile,
      touches: Array.from(currentTouches),
      confidence: newConfidence
    },
    wasAutoCorrected,
    addedTouches,
    originalConfidence
  };
}

/**
 * Helper to extract constraint text from various sources.
 */
export function extractConstraintsFromMetadata(
  metadata: {
    constraintsExtracted?: Array<{ constraint: string }>;
  }
): string[] {
  if (!metadata.constraintsExtracted) {
    return [];
  }
  return metadata.constraintsExtracted.map(c => c.constraint);
}
```

---

## 5. Spec Hook

### 5.1 Implementation

```typescript
// File: src/workflow/spec-hook.ts
import type { Database } from 'better-sqlite3';
import type { TaskProfile } from '../schemas';
import { extractTaskProfileFromContextPack } from '../injection/task-profile-extractor';
import { selectWarningsForInjection } from '../injection/selector';
import { formatInjectionForPrompt, formatWarningsSummary } from '../injection/formatter';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';

export interface ContextPackMetadata {
  workspaceId: string;  // v1.2: Required for scoped queries
  projectId: string;    // v1.2: Required for scoped queries
  issueId: string;
  taskProfile?: Partial<TaskProfile>;
  constraintsExtracted?: Array<{
    constraint: string;
    source: { kind: string; path?: string };
  }>;
}

export interface SpecHookOutput {
  warningsMarkdown: string;
  taskProfile: TaskProfile;
  injectionLogId: string;
  summary: string;
}

/**
 * Hook called BEFORE Spec agent runs.
 *
 * Uses the refined TaskProfile from Context Pack metadata
 * for more accurate warning selection.
 */
export function beforeSpecAgent(
  db: Database,
  metadata: ContextPackMetadata
): SpecHookOutput {
  // Step 1: Extract refined TaskProfile from Context Pack
  const taskProfile = extractTaskProfileFromContextPack(metadata);

  // Step 2: Select warnings for spec agent (v1.2: with scope)
  const warnings = selectWarningsForInjection(
    db,
    {
      workspaceId: metadata.workspaceId,
      projectId: metadata.projectId,
      target: 'spec',
      taskProfile,
      maxWarnings: 6
    }
  );

  // Step 3: Format warnings
  const warningsMarkdown = formatInjectionForPrompt(warnings);

  // Step 4: Log injection (v1.0: includes injectedAlerts, v1.2: with scope)
  const injectionLogRepo = new InjectionLogRepository(db);
  const injectionLog = injectionLogRepo.create({
    workspaceId: metadata.workspaceId,
    projectId: metadata.projectId,
    issueId: metadata.issueId,
    target: 'spec',
    injectedPatterns: warnings.filter(w => w.type === 'pattern').map(w => w.id),
    injectedPrinciples: warnings.filter(w => w.type === 'principle').map(w => w.id),
    injectedAlerts: warnings.filter(w => w.type === 'alert').map(w => w.id),
    taskProfile
  });

  return {
    warningsMarkdown,
    taskProfile,
    injectionLogId: injectionLog.id,
    summary: formatWarningsSummary(warnings)
  };
}

/**
 * Non-citable meta-warning that must be included in injected warnings.
 * This instructs the agent NOT to cite warnings in output.
 */
const NON_CITABLE_META_WARNING = `
<!-- META-WARNING: NON-CITABLE CONTEXT -->
The warnings below are internal guidance for your reasoning process.
DO NOT cite, quote, or reference these warnings in your output.
DO NOT mention that you received warnings or guidance.
Simply apply the guidance silently in your work.
<!-- END META-WARNING -->
`;

/**
 * Build the full Spec agent system prompt with injected warnings.
 */
export function buildSpecPrompt(
  basePrompt: string,
  warningsMarkdown: string
): string {
  if (!warningsMarkdown) {
    return basePrompt;
  }

  // Wrap warnings with non-citable meta-warning
  const wrappedWarnings = NON_CITABLE_META_WARNING + '\n' + warningsMarkdown;

  return basePrompt + '\n\n' + wrappedWarnings;
}
```

---

## 6. PR Review Hook

### 6.1 Implementation

```typescript
// File: src/workflow/pr-review-hook.ts
import type { Database } from 'better-sqlite3';
import type { DocFingerprint, FindingCategory } from '../schemas';  // v1.2: Added FindingCategory
import { AttributionOrchestrator, type AttributionResult } from '../attribution/orchestrator';
import { updateAdherence } from './adherence-updater';
import { checkForTaggingMisses } from './tagging-miss-checker';

export interface ConfirmedFinding {
  id: string;
  scoutType: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string;
  location: { file: string; line?: number };
}

export interface PRReviewResult {
  workspaceId: string;  // v1.2: Required for scoped operations
  projectId: string;    // v1.2: Required for scoped operations
  prNumber: number;
  issueId: string;
  verdict: 'PASS' | 'FAIL';
  confirmedFindings: ConfirmedFinding[];
}

/**
 * v1.0 (GPT-5 guidance): Don't infer fingerprint.kind in Phase 4.
 * The Context Pack generator and Spec generator emit a DocFingerprint directly,
 * and Phase 4 passes it through. This avoids "is it git or linear?" confusion.
 *
 * Use kind: 'linear' if docs are stored as Linear documents.
 * Use kind: 'git' only if docs are committed as files in the repo.
 */
export interface DocumentContext {
  content: string;
  fingerprint: DocFingerprint;  // v1.0: Canonical fingerprint from generator
}

export interface PRReviewHookOutput {
  attributionResults: AttributionResult[];
  taggingMisses: number;
  summary: {
    patterns: number;
    noncompliances: number;
    docUpdates: number;
  };
}

/**
 * Hook called AFTER PR Review completes.
 *
 * Triggers attribution for all confirmed findings.
 *
 * v1.0 (GPT-5 guidance): Fingerprints are passed through from DocumentContext,
 * not inferred here. The Context Pack/Spec generators are responsible for
 * emitting the correct fingerprint.kind based on where docs are actually stored.
 */
export async function onPRReviewComplete(
  db: Database,
  result: PRReviewResult,
  contextPack: DocumentContext,
  spec: DocumentContext
): Promise<PRReviewHookOutput> {
  const orchestrator = new AttributionOrchestrator(db);
  const attributionResults: AttributionResult[] = [];

  // v1.0: Pass through fingerprints from generators (don't infer kind here)
  // v1.2: Pass scope to all attribution operations
  // Process each confirmed finding
  for (const finding of result.confirmedFindings) {
    try {
      const attributionResult = await orchestrator.attributeFinding({
        workspaceId: result.workspaceId,  // v1.2: Required scope
        projectId: result.projectId,       // v1.2: Required scope
        finding: {
          ...finding,
          issueId: result.issueId,
          prNumber: result.prNumber
        },
        contextPack: {
          content: contextPack.content,
          fingerprint: contextPack.fingerprint  // v1.0: Pass through
        },
        spec: {
          content: spec.content,
          fingerprint: spec.fingerprint          // v1.0: Pass through
        }
      });

      attributionResults.push(attributionResult);

      console.log(
        `[Attribution] Finding ${finding.id}: ${attributionResult.type}` +
        (attributionResult.resolverResult
          ? ` (${attributionResult.resolverResult.failureMode})`
          : '')
      );
    } catch (error) {
      console.error(`[Attribution] Failed for finding ${finding.id}:`, error);
    }
  }

  // Update adherence tracking (v1.2: scope passed via result)
  await updateAdherence(db, result);

  // Check for tagging misses (v1.2: scope passed via result)
  const taggingMisses = await checkForTaggingMisses(db, result, attributionResults);

  // Build summary
  const summary = {
    patterns: attributionResults.filter(r => r.type === 'pattern').length,
    noncompliances: attributionResults.filter(r => r.type === 'noncompliance').length,
    docUpdates: attributionResults.filter(r => r.docUpdateRequest).length
  };

  return {
    attributionResults,
    taggingMisses,
    summary
  };
}
```

### 6.2 ProvisionalAlert Promotion

When a new occurrence is created and meets the pattern gate threshold, any related ProvisionalAlert should be promoted to a full Pattern.

```typescript
// File: src/workflow/provisional-alert-promoter.ts
import type { Database } from 'better-sqlite3';
import { ProvisionalAlertRepository } from '../storage/repositories/provisional-alert.repo';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';

/**
 * Pattern gate configuration.
 * A ProvisionalAlert is promoted to a Pattern when it meets these thresholds.
 */
export interface PatternGateConfig {
  minOccurrences: number;         // Minimum number of occurrences
  minUniqueIssues: number;        // Minimum unique issues affected
  minConfidence: number;          // Minimum average confidence
  maxDaysOld: number;             // Maximum age of oldest occurrence
}

export const DEFAULT_PATTERN_GATE: PatternGateConfig = {
  minOccurrences: 3,
  minUniqueIssues: 2,
  minConfidence: 0.7,
  maxDaysOld: 90
};

export interface PromotionResult {
  promoted: boolean;
  alertId: string;
  patternId?: string;
  reason?: string;
}

export interface PromotionScope {
  workspaceId: string;
  projectId: string;
}

/**
 * Check if a ProvisionalAlert should be promoted to a Pattern.
 *
 * Called during occurrence creation to check if the pattern gate is now met.
 * v1.2: Requires scope to ensure all operations are properly scoped.
 */
export function checkAndPromoteAlert(
  db: Database,
  scope: PromotionScope,  // v1.2: Required scope
  alertId: string,
  config: PatternGateConfig = DEFAULT_PATTERN_GATE
): PromotionResult {
  const alertRepo = new ProvisionalAlertRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);

  // Get the provisional alert (v1.2: scoped query)
  const alert = alertRepo.findById({ workspaceId: scope.workspaceId, id: alertId });
  if (!alert) {
    return { promoted: false, alertId, reason: 'Alert not found' };
  }

  // Already promoted?
  if (alert.status === 'promoted') {
    return { promoted: false, alertId, reason: 'Already promoted' };
  }

  // Get all occurrences linked to this alert (v1.2: scoped query)
  const occurrences = occurrenceRepo.findByProvisionalAlertId({
    workspaceId: scope.workspaceId,
    alertId
  });

  // Check pattern gate: minimum occurrences
  if (occurrences.length < config.minOccurrences) {
    return {
      promoted: false,
      alertId,
      reason: `Insufficient occurrences: ${occurrences.length}/${config.minOccurrences}`
    };
  }

  // Check pattern gate: unique issues
  const uniqueIssues = new Set(occurrences.map(o => o.issueId));
  if (uniqueIssues.size < config.minUniqueIssues) {
    return {
      promoted: false,
      alertId,
      reason: `Insufficient unique issues: ${uniqueIssues.size}/${config.minUniqueIssues}`
    };
  }

  // Check pattern gate: average confidence
  const avgConfidence = occurrences.reduce((sum, o) => sum + (o.confidence || 0), 0) / occurrences.length;
  if (avgConfidence < config.minConfidence) {
    return {
      promoted: false,
      alertId,
      reason: `Insufficient confidence: ${avgConfidence.toFixed(2)}/${config.minConfidence}`
    };
  }

  // Check pattern gate: age of oldest occurrence
  const oldestOccurrence = occurrences.reduce((oldest, o) =>
    new Date(o.createdAt) < new Date(oldest.createdAt) ? o : oldest
  );
  const daysSinceOldest = (Date.now() - new Date(oldestOccurrence.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOldest > config.maxDaysOld) {
    return {
      promoted: false,
      alertId,
      reason: `Occurrences too spread out: ${daysSinceOldest.toFixed(0)} days > ${config.maxDaysOld}`
    };
  }

  // Pattern gate met - promote the alert (v1.2: scoped operations)
  const pattern = patternRepo.createFromProvisionalAlert({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    alert,
    stats: {
      occurrenceCount: occurrences.length,
      uniqueIssueCount: uniqueIssues.size,
      averageConfidence: avgConfidence
    }
  });

  // Update alert status (v1.2: scoped)
  alertRepo.updateStatus({
    workspaceId: scope.workspaceId,
    id: alertId,
    status: 'promoted',
    promotedPatternId: pattern.id
  });

  // Link occurrences to the new pattern (v1.2: scoped)
  for (const occurrence of occurrences) {
    occurrenceRepo.update({
      workspaceId: scope.workspaceId,
      id: occurrence.id,
      patternId: pattern.id,
      provisionalAlertId: null
    });
  }

  console.log(
    `[ProvisionalAlert] Promoted alert ${alertId} to pattern ${pattern.id}` +
    ` (${occurrences.length} occurrences, ${uniqueIssues.size} issues, ${avgConfidence.toFixed(2)} confidence)`
  );

  return {
    promoted: true,
    alertId,
    patternId: pattern.id
  };
}

/**
 * Hook to call after creating a new occurrence.
 * Checks if any linked ProvisionalAlert should be promoted.
 * v1.2: Requires scope for scoped promotion checks.
 */
export function onOccurrenceCreated(
  db: Database,
  scope: PromotionScope,  // v1.2: Required scope
  occurrenceId: string,
  provisionalAlertId?: string
): PromotionResult | null {
  if (!provisionalAlertId) {
    return null;
  }

  return checkAndPromoteAlert(db, scope, provisionalAlertId);
}
```

---

## 7. Adherence Updater

### 7.1 Implementation

```typescript
// File: src/workflow/adherence-updater.ts
import type { Database } from 'better-sqlite3';
import type { PRReviewResult, ConfirmedFinding } from './pr-review-hook';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';

/**
 * Update adherence tracking after PR Review.
 *
 * For each pattern that was injected:
 * - If finding occurred → wasAdheredTo = false
 * - If no finding → pattern was followed (implicit adherence)
 *
 * v1.2: Uses scope from PRReviewResult for all repository operations.
 */
export async function updateAdherence(
  db: Database,
  result: PRReviewResult
): Promise<{ updated: number }> {
  const injectionLogRepo = new InjectionLogRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  let updated = 0;

  // Get all injection logs for this issue (v1.2: scoped)
  const logs = injectionLogRepo.findByIssueId({
    workspaceId: result.workspaceId,
    projectId: result.projectId,
    issueId: result.issueId
  });

  for (const log of logs) {
    // Check each injected pattern
    for (const patternId of log.injectedPatterns) {
      // v1.2: scoped findById
      const pattern = patternRepo.findById({
        workspaceId: result.workspaceId,
        id: patternId
      });
      if (!pattern) continue;

      // Check if there's a finding for this pattern
      const hasRelatedFinding = checkForRelatedFinding(
        pattern,
        result.confirmedFindings
      );

      // Find the occurrence (if any) for this pattern + issue (v1.2: scoped)
      const occurrence = occurrenceRepo.findByPatternAndIssue({
        workspaceId: result.workspaceId,
        projectId: result.projectId,
        patternId,
        issueId: result.issueId
      });

      if (occurrence) {
        // Update existing occurrence (v1.2: scoped)
        occurrenceRepo.update({
          workspaceId: result.workspaceId,
          id: occurrence.id,
          wasInjected: true,
          wasAdheredTo: !hasRelatedFinding
        });
        updated++;
      } else if (hasRelatedFinding) {
        // New finding despite injection - occurrence will be created by attribution
        // The attribution process will set wasInjected = true
      }
      // If no occurrence and no finding, the pattern was followed (no action needed)
    }
  }

  return { updated };
}

/**
 * Check if any finding relates to a pattern.
 * Uses keyword matching and category alignment.
 */
function checkForRelatedFinding(
  pattern: PatternDefinition,
  findings: ConfirmedFinding[]
): boolean {
  // Extract keywords from pattern
  const patternKeywords = extractKeywords(pattern.patternContent);

  for (const finding of findings) {
    // Check category alignment
    const categoryMatch = mapScoutToCategory(finding.scoutType) === pattern.findingCategory;
    if (!categoryMatch) continue;

    // Check keyword overlap
    const findingText = `${finding.title} ${finding.description}`.toLowerCase();
    const keywordMatch = patternKeywords.some(kw => findingText.includes(kw));

    if (keywordMatch) {
      return true;
    }
  }

  return false;
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
}

// v1.2 FIX: Return type and 'decisions' mapping aligned with Phase 2
function mapScoutToCategory(scoutType: string): FindingCategory {
  const mapping: Record<string, FindingCategory> = {
    adversarial: 'security',
    security: 'security',
    bugs: 'correctness',
    tests: 'testing',
    docs: 'compliance',
    spec: 'compliance',
    decisions: 'decisions'  // v1.2: Fixed to match Phase 2 (not 'compliance')
  };
  return mapping[scoutType] || 'correctness';
}
```

---

## 8. Tagging Miss Checker

### 8.1 Implementation

```typescript
// File: src/workflow/tagging-miss-checker.ts
import type { Database } from 'better-sqlite3';
import type { PRReviewResult } from './pr-review-hook';
import type { AttributionResult } from '../attribution/orchestrator';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';
import { TaggingMissRepository } from '../storage/repositories/tagging-miss.repo';

/**
 * Check for tagging misses after attribution.
 *
 * A tagging miss occurs when:
 * - A pattern was attributed to a finding
 * - But that pattern was NOT injected for this issue
 * - Due to TaskProfile mismatch
 *
 * v1.2: Uses scope from PRReviewResult for all repository operations.
 */
export async function checkForTaggingMisses(
  db: Database,
  result: PRReviewResult,
  attributionResults: AttributionResult[]
): Promise<number> {
  const injectionLogRepo = new InjectionLogRepository(db);
  const taggingMissRepo = new TaggingMissRepository(db);

  let missCount = 0;

  // Get injection logs for this issue (v1.2: scoped)
  const logs = injectionLogRepo.findByIssueId({
    workspaceId: result.workspaceId,
    projectId: result.projectId,
    issueId: result.issueId
  });
  const injectedPatternIds = new Set(
    logs.flatMap(l => l.injectedPatterns)
  );

  // Get the TaskProfile that was used
  const taskProfile = logs[0]?.taskProfile;
  if (!taskProfile) {
    return 0; // No injection happened
  }

  // Check each attribution result
  for (const attrResult of attributionResults) {
    if (attrResult.type !== 'pattern' || !attrResult.pattern) {
      continue;
    }

    const pattern = attrResult.pattern;

    // Was this pattern injected?
    if (injectedPatternIds.has(pattern.id)) {
      continue; // Not a miss
    }

    // Pattern was NOT injected - why?
    // Check if it would have matched with correct tags
    const wouldMatch = checkWouldMatch(pattern, taskProfile);

    if (!wouldMatch.matches) {
      // This is a tagging miss (v1.2: scoped)
      taggingMissRepo.create({
        workspaceId: result.workspaceId,
        projectId: result.projectId,
        findingId: attrResult.occurrence!.findingId,
        patternId: pattern.id,
        actualTaskProfile: taskProfile,
        requiredMatch: {
          touches: pattern.touches,
          technologies: pattern.technologies,
          taskTypes: pattern.taskTypes
        },
        missingTags: wouldMatch.missingTags,
        status: 'pending'
      });
      missCount++;
    }
  }

  return missCount;
}

interface MatchResult {
  matches: boolean;
  missingTags: string[];
}

function checkWouldMatch(
  pattern: PatternDefinition,
  taskProfile: TaskProfile
): MatchResult {
  const missingTags: string[] = [];

  // Check touches
  const touchOverlap = pattern.touches.some(t =>
    taskProfile.touches.includes(t)
  );
  if (!touchOverlap && pattern.touches.length > 0) {
    missingTags.push(...pattern.touches.map(t => `touch:${t}`));
  }

  // Check technologies
  const techOverlap = pattern.technologies.some(t =>
    taskProfile.technologies.includes(t)
  );
  if (!techOverlap && pattern.technologies.length > 0) {
    missingTags.push(...pattern.technologies.map(t => `tech:${t}`));
  }

  // Check taskTypes
  const typeOverlap = pattern.taskTypes.some(t =>
    taskProfile.taskTypes.includes(t)
  );
  if (!typeOverlap && pattern.taskTypes.length > 0) {
    missingTags.push(...pattern.taskTypes.map(t => `type:${t}`));
  }

  return {
    matches: touchOverlap || techOverlap || typeOverlap,
    missingTags
  };
}
```

### 8.6 Linear Integration Error Handling

Per spec Section 1.10 (Offline and Degraded Mode Policy), Linear unavailability should not block core operations.

**Error Handling Strategy:**

```typescript
interface LinearIntegrationConfig {
  retryAttempts: number;       // Default: 3
  retryDelayMs: number;        // Default: 1000
  timeoutMs: number;           // Default: 5000
  fallbackToLocal: boolean;    // Default: true
}

const DEFAULT_LINEAR_CONFIG: LinearIntegrationConfig = {
  retryAttempts: 3,
  retryDelayMs: 1000,
  timeoutMs: 5000,
  fallbackToLocal: true
};

async function fetchLinearIssue(
  issueId: string,
  config: LinearIntegrationConfig = DEFAULT_LINEAR_CONFIG
): Promise<LinearIssue | null> {
  for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
    try {
      const response = await linearClient.issue(issueId, {
        timeout: config.timeoutMs
      });
      return response;
    } catch (error) {
      if (isRateLimitError(error)) {
        // Log and wait for rate limit reset
        const resetAt = error.headers?.['x-ratelimit-reset'];
        logEvent({
          type: 'linear_rate_limited',
          issueId,
          attempt,
          resetAt
        });
        await sleep(config.retryDelayMs * attempt);
        continue;
      }

      if (isNetworkError(error) && attempt < config.retryAttempts) {
        // Retry on network errors
        logEvent({
          type: 'linear_network_error',
          issueId,
          attempt,
          error: error.message
        });
        await sleep(config.retryDelayMs * attempt);
        continue;
      }

      // Non-retryable error or max retries reached
      logEvent({
        type: 'linear_unavailable',
        issueId,
        attempt,
        error: error.message,
        action: config.fallbackToLocal ? 'using_local_metadata' : 'failing'
      });

      if (config.fallbackToLocal) {
        return null; // Caller should use local metadata
      }
      throw error;
    }
  }
  return null;
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof LinearError && error.status === 429;
}

function isNetworkError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('fetch failed')
  );
}
```

**Fallback Behavior When Linear Unavailable:**

| Operation | Fallback |
|-----------|----------|
| Issue data fetch | Use `.falcon/` metadata from git |
| TaskProfile extraction | Extract from local context pack frontmatter |
| Document backlinks | Queue for later sync |
| Label updates | Skip silently, log event |

**Integration with Workflow Hooks:**

```typescript
// In context-pack-hook.ts
async function beforeContextPackAgent(input: ContextPackHookInput): Promise<ContextPackHookOutput> {
  let issueData: IssueData;

  // Try Linear first, fall back to local
  const linearIssue = await fetchLinearIssue(input.issue.id);

  if (linearIssue) {
    issueData = mapLinearIssueToIssueData(linearIssue);
  } else {
    // Fallback: use provided input data (from local context)
    issueData = {
      id: input.issue.id,
      title: input.issue.title,
      description: input.issue.description,
      labels: input.issue.labels || []
    };

    logEvent({
      type: 'injection_using_local_metadata',
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      issueId: input.issue.id,
      reason: 'linear_unavailable'
    });
  }

  // Continue with injection using whatever data we have
  const taskProfile = extractTaskProfileFromIssue(issueData);
  // ... rest of injection logic
}
```

**Observability:**

```typescript
interface LinearIntegrationLogEvent {
  type:
    | 'linear_unavailable'
    | 'linear_rate_limited'
    | 'linear_network_error'
    | 'injection_using_local_metadata'
    | 'linear_sync_queued';
  timestamp: string;
  workspaceId?: string;
  projectId?: string;
  issueId: string;
  attempt?: number;
  resetAt?: string;
  error?: string;
  action?: string;
  reason?: string;
}
```

---

## 9. Injection Tracker

### 9.1 Repository Implementation

```typescript
// File: src/storage/repositories/injection-log.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { InjectionLog, TaskProfile } from '../../schemas';
import { InjectionLogSchema } from '../../schemas';
import { BaseRepository } from './base.repo';

/**
 * Extended InjectionLog interface with alert tracking (v1.0) and scope (v1.2).
 */
export interface InjectionLogV1 extends InjectionLog {
  /** Workspace scope (v1.2 addition) */
  workspaceId: string;
  /** Project scope (v1.2 addition) */
  projectId: string;
  /** IDs of injected ProvisionalAlerts (v1.0 addition) */
  injectedAlerts: string[];
}

type CreateInput = Omit<InjectionLogV1, 'id' | 'injectedAt'>;

export class InjectionLogRepository extends BaseRepository<InjectionLogV1> {

  // v1.2 FIX: Scoped findById to prevent cross-workspace data leakage
  findById(options: { workspaceId: string; id: string }): InjectionLogV1 | null {
    const row = this.db.prepare(
      'SELECT * FROM injection_logs WHERE workspace_id = ? AND id = ?'
    ).get(options.workspaceId, options.id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * v1.2: Scoped query by issue ID within workspace/project.
   */
  findByIssueId(options: {
    workspaceId: string;
    projectId: string;
    issueId: string;
  }): InjectionLogV1[] {
    const rows = this.db.prepare(
      `SELECT * FROM injection_logs
       WHERE workspace_id = ? AND project_id = ? AND issue_id = ?
       ORDER BY injected_at DESC`
    ).all(options.workspaceId, options.projectId, options.issueId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * v1.2: Scoped query by target within workspace/project.
   */
  findByTarget(options: {
    workspaceId: string;
    projectId: string;
    issueId: string;
    target: 'context-pack' | 'spec';
  }): InjectionLogV1 | null {
    const row = this.db.prepare(
      `SELECT * FROM injection_logs
       WHERE workspace_id = ? AND project_id = ? AND issue_id = ? AND target = ?`
    ).get(options.workspaceId, options.projectId, options.issueId, options.target) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all logs that injected a specific alert.
   * Useful for tracking alert effectiveness.
   * v1.2: Scoped to workspace.
   */
  findByAlertId(options: {
    workspaceId: string;
    alertId: string;
  }): InjectionLogV1[] {
    const rows = this.db.prepare(
      `SELECT * FROM injection_logs
       WHERE workspace_id = ? AND json_extract(injected_alerts, '$') LIKE ?
       ORDER BY injected_at DESC`
    ).all(options.workspaceId, `%"${options.alertId}"%`) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  create(data: CreateInput): InjectionLogV1 {
    const log: InjectionLogV1 = {
      id: uuidv4(),
      injectedAt: new Date().toISOString(),
      injectedAlerts: data.injectedAlerts || [], // Default to empty array for backward compat
      ...data
    };

    // Validate
    InjectionLogSchema.parse(log);

    // v1.2: Include workspace_id and project_id in INSERT
    this.db.prepare(`
      INSERT INTO injection_logs (
        id, workspace_id, project_id, issue_id, target, injected_patterns,
        injected_principles, injected_alerts, task_profile, injected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      log.workspaceId,
      log.projectId,
      log.issueId,
      log.target,
      this.stringifyJsonField(log.injectedPatterns),
      this.stringifyJsonField(log.injectedPrinciples),
      this.stringifyJsonField(log.injectedAlerts),
      this.stringifyJsonField(log.taskProfile),
      log.injectedAt
    );

    return log;
  }

  private rowToEntity(row: Record<string, unknown>): InjectionLogV1 {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,  // v1.2
      projectId: row.project_id as string,      // v1.2
      issueId: row.issue_id as string,
      target: row.target as InjectionLog['target'],
      injectedPatterns: this.parseJsonField<string[]>(row.injected_patterns as string),
      injectedPrinciples: this.parseJsonField<string[]>(row.injected_principles as string),
      injectedAlerts: this.parseJsonField<string[]>(row.injected_alerts as string) || [],
      taskProfile: this.parseJsonField<TaskProfile>(row.task_profile as string),
      injectedAt: row.injected_at as string
    };
  }
}
```

### 9.2 Schema Migration for injectedAlerts and Scope

```sql
-- Migration: Add injected_alerts and scope columns to injection_logs table
-- File: migrations/004_add_injected_alerts_and_scope.sql

-- v1.0: Add injected_alerts
ALTER TABLE injection_logs
ADD COLUMN injected_alerts TEXT DEFAULT '[]';

-- v1.2: Add scope columns
ALTER TABLE injection_logs
ADD COLUMN workspace_id TEXT NOT NULL;

ALTER TABLE injection_logs
ADD COLUMN project_id TEXT NOT NULL;

-- v1.0: Create index for alert lookup
CREATE INDEX idx_injection_logs_alerts
ON injection_logs(json_extract(injected_alerts, '$'));

-- v1.2: Create index for scoped queries
CREATE INDEX idx_injection_logs_scope
ON injection_logs(workspace_id, project_id, issue_id);

-- v1.2: Add foreign key references (constraint enforced by application)
-- workspace_id REFERENCES workspaces(id)
-- project_id REFERENCES projects(id)
```

---

## 10. Integration Example

### 10.1 Full Workflow Usage

```typescript
// Example: Full workflow integration

import { initDatabase } from './storage/db';
import { seedBaselines } from './storage/seed/baselines';
import { beforeContextPackAgent } from './workflow/context-pack-hook';
import { beforeSpecAgent } from './workflow/spec-hook';
import { onPRReviewComplete } from './workflow/pr-review-hook';

async function runWorkflow() {
  // Initialize
  const db = initDatabase();
  seedBaselines(new DerivedPrincipleRepository(db));

  // v1.2: Define scope for the entire workflow
  const workspaceId = 'ws-acme-corp';
  const projectId = 'proj-main-app';

  // === CONTEXT PACK PHASE ===
  // v1.2: Include scope in all hook inputs
  const cpResult = beforeContextPackAgent(db, {
    workspaceId,
    projectId,
    issue: {
      id: 'CON-123',
      title: 'Add user search API endpoint',
      description: 'Implement search by name with SQL query',
      labels: ['feature', 'api', 'database']
    }
  });

  console.log(`[Context Pack] ${cpResult.summary}`);
  console.log(`[Context Pack] TaskProfile confidence: ${cpResult.taskProfile.confidence}`);

  // Build Context Pack prompt with warnings
  const contextPackPrompt = buildContextPackPrompt(
    BASE_CONTEXT_PACK_PROMPT,
    cpResult.warningsMarkdown
  );

  // ... run Context Pack agent with contextPackPrompt ...

  // === SPEC PHASE ===
  // v1.2: Include scope in spec hook input
  const specResult = beforeSpecAgent(db, {
    workspaceId,
    projectId,
    issueId: 'CON-123',
    taskProfile: {
      touches: ['database', 'user_input', 'api'],
      technologies: ['sql', 'postgres'],
      taskTypes: ['api', 'database'],
      confidence: 0.85
    }
  });

  console.log(`[Spec] ${specResult.summary}`);

  // Build Spec prompt with warnings
  const specPrompt = buildSpecPrompt(
    BASE_SPEC_PROMPT,
    specResult.warningsMarkdown
  );

  // ... run Spec agent with specPrompt ...
  // ... run Implementation agent ...
  // ... run PR Review ...

  // === POST-REVIEW PHASE ===
  //
  // v1.0 (GPT-5 guidance): Fingerprints are generated by TypeScript code
  // when documents are persisted, NOT by agents. The workflow orchestrator
  // that saves the document also generates the fingerprint based on storage:
  //
  // - If saved to git (e.g., context-packs/CON-123.md):
  //   { kind: 'git', repo: 'current', path: '...', commitSha: '...' }
  //
  // - If saved to Linear as a document:
  //   { kind: 'linear', docId: '<linear-doc-id>' }
  //
  // The agent only generates content - fingerprinting is infrastructure concern.

  // Example: Documents stored in git
  const contextPackFingerprint: DocFingerprint = {
    kind: 'git',
    repo: 'current',
    path: 'context-packs/CON-123.md',
    commitSha: 'abc123'
  };

  const specFingerprint: DocFingerprint = {
    kind: 'git',
    repo: 'current',
    path: 'specs/CON-123.md',
    commitSha: 'abc123'
  };

  // Alternative: Documents stored in Linear
  // const contextPackFingerprint: DocFingerprint = {
  //   kind: 'linear',
  //   docId: 'linear-doc-uuid-for-context-pack'
  // };

  // v1.2: Include scope in PR review result
  const reviewResult = await onPRReviewComplete(
    db,
    {
      workspaceId,
      projectId,
      prNumber: 456,
      issueId: 'CON-123',
      verdict: 'FAIL',
      confirmedFindings: [
        {
          id: 'finding-1',
          scoutType: 'adversarial',
          title: 'SQL Injection vulnerability',
          description: 'User input interpolated into SQL query',
          severity: 'HIGH',
          evidence: "const query = `SELECT * FROM users WHERE name = '${name}'`",
          location: { file: 'src/api/search.ts', line: 42 }
        }
      ]
    },
    {
      content: '... context pack content ...',
      fingerprint: contextPackFingerprint  // v1.0: Canonical fingerprint from generator
    },
    {
      content: '... spec content ...',
      fingerprint: specFingerprint          // v1.0: Canonical fingerprint from generator
    }
  );

  console.log(`[Attribution] Results:`, reviewResult.summary);
  console.log(`[Attribution] Tagging misses: ${reviewResult.taggingMisses}`);
}
```

### 10.2 End-to-End Test Scenarios

**File:** `tests/workflow/integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initDatabase, resetDatabase } from '../../src/storage/db';
import { seedBaselines } from '../../src/storage/seed/baselines';
import { WorkspaceRepository } from '../../src/storage/repositories/workspace.repo';
import { ProjectRepository } from '../../src/storage/repositories/project.repo';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo';
import { InjectionLogRepository } from '../../src/storage/repositories/injection-log.repo';
import { beforeContextPackAgent } from '../../src/workflow/context-pack-hook';
import { beforeSpecAgent } from '../../src/workflow/spec-hook';
import { onPRReviewComplete } from '../../src/workflow/pr-review-hook';
import { updateAdherence } from '../../src/workflow/adherence-updater';
import { checkForTaggingMisses } from '../../src/workflow/tagging-miss-checker';

describe('End-to-End Workflow Integration', () => {
  let db: Database;
  let workspaceId: string;
  let projectId: string;
  let workspaceRepo: WorkspaceRepository;
  let projectRepo: ProjectRepository;
  let patternRepo: PatternDefinitionRepository;
  let injectionLogRepo: InjectionLogRepository;

  beforeAll(async () => {
    db = initDatabase(':memory:');
    workspaceRepo = new WorkspaceRepository(db);
    projectRepo = new ProjectRepository(db);
    patternRepo = new PatternDefinitionRepository(db);
    injectionLogRepo = new InjectionLogRepository(db);
  });

  beforeEach(async () => {
    resetDatabase(db);

    // Create workspace and project
    const workspace = workspaceRepo.create({
      name: 'Test Workspace',
      slug: 'test-workspace',
      config: {},
      status: 'active'
    });
    workspaceId = workspace.id;

    const project = projectRepo.create({
      workspaceId,
      name: 'Test Project',
      repoOriginUrl: 'git@github.com:test/repo.git',
      config: {},
      status: 'active'
    });
    projectId = project.id;

    // Seed baselines
    seedBaselines(new DerivedPrincipleRepository(db), workspaceId);
  });

  afterAll(() => {
    db.close();
  });

  describe('Full Feedback Loop Cycle', () => {
    it('complete cycle: issue → context pack → spec → PR review → attribution → future injection', async () => {
      const issueId = 'PROJ-123';

      // STEP 1: Context Pack creation with injection
      const contextPackResult = await beforeContextPackAgent({
        workspaceId,
        projectId,
        issue: {
          id: issueId,
          title: 'Add user login endpoint',
          description: 'Implement POST /api/login with JWT authentication',
          labels: ['api', 'auth']
        }
      });

      expect(contextPackResult.injectedWarnings).toBeDefined();
      expect(contextPackResult.taskProfile.touches).toContain('auth');

      // Verify injection log created
      const cpInjectionLog = injectionLogRepo.findByIssueId({ workspaceId, projectId, issueId })[0];
      expect(cpInjectionLog.target).toBe('context-pack');

      // STEP 2: Spec creation with injection (using refined TaskProfile)
      const specResult = await beforeSpecAgent({
        workspaceId,
        projectId,
        issueId,
        contextPackMetadata: {
          taskProfile: {
            touches: ['auth', 'api', 'user_input'],
            technologies: ['jwt'],
            taskTypes: ['api', 'auth'],
            confidence: 0.85
          }
        }
      });

      expect(specResult.injectedWarnings).toBeDefined();

      // STEP 3: PR Review finds SQL injection vulnerability
      const prReviewResult = await onPRReviewComplete({
        workspaceId,
        projectId,
        issueId,
        prNumber: 456,
        confirmedFindings: [{
          id: 'finding-001',
          title: 'SQL Injection in login query',
          description: 'User input is concatenated directly into SQL query',
          scoutType: 'security',
          severity: 'CRITICAL',
          evidence: 'const query = `SELECT * FROM users WHERE email = "${email}"`',
          location: { file: 'src/auth/login.ts', line: 42 }
        }],
        contextPack: {
          content: '# Context Pack for PROJ-123\n\nUse template literals for readability in queries.',
          fingerprint: { kind: 'git', repo: 'test/repo', path: '.falcon/context_packs/PROJ-123.md', commitSha: 'abc123' }
        },
        spec: {
          content: '# Spec for PROJ-123\n\nImplement login endpoint.',
          fingerprint: { kind: 'git', repo: 'test/repo', path: '.falcon/specs/PROJ-123.md', commitSha: 'abc123' }
        }
      });

      expect(prReviewResult.attributionResults.length).toBe(1);
      expect(prReviewResult.attributionResults[0].type).toBe('pattern');

      const pattern = prReviewResult.attributionResults[0].pattern;
      expect(pattern.findingCategory).toBe('security');
      expect(pattern.severityMax).toBe('CRITICAL');

      // STEP 4: Update adherence tracking
      await updateAdherence({
        workspaceId,
        projectId,
        issueId,
        confirmedFindings: prReviewResult.confirmedFindings
      });

      // STEP 5: Check for tagging misses
      const taggingMisses = await checkForTaggingMisses({
        workspaceId,
        projectId,
        findingId: 'finding-001',
        patternId: pattern.id,
        actualTaskProfile: contextPackResult.taskProfile
      });

      // STEP 6: Future issue should receive the new pattern warning
      const futureIssueResult = await beforeContextPackAgent({
        workspaceId,
        projectId,
        issue: {
          id: 'PROJ-456',
          title: 'Add user registration endpoint',
          description: 'Implement POST /api/register with database insert',
          labels: ['api', 'database']
        }
      });

      // Should include the SQL injection warning from the previous finding
      const sqlWarning = futureIssueResult.injectedWarnings.find(
        w => w.patternId === pattern.id
      );
      expect(sqlWarning).toBeDefined();
    });
  });

  describe('Kill Switch Integration', () => {
    it('continues injection during INFERRED_PAUSED state', async () => {
      // Set kill switch to INFERRED_PAUSED
      const killSwitchService = new KillSwitchService(db);
      await killSwitchService.pausePatternCreation({
        workspaceId,
        projectId,
        targetState: 'INFERRED_PAUSED',
        reason: 'High inferred ratio in tests'
      });

      // Create a verbatim pattern (should still be created)
      const verbatimPattern = patternRepo.create({
        workspaceId,
        projectId,
        patternContent: 'Use console.log for debugging',
        failureMode: 'incorrect',
        findingCategory: 'correctness',
        severity: 'LOW',
        severityMax: 'LOW',
        alternative: 'Use proper logging framework',
        carrierStage: 'context-pack',
        primaryCarrierQuoteType: 'verbatim',
        technologies: [],
        taskTypes: [],
        touches: ['logging'],
        status: 'active',
        permanent: false
      });

      // Injection should still work
      const result = await beforeContextPackAgent({
        workspaceId,
        projectId,
        issue: {
          id: 'PROJ-789',
          title: 'Add logging',
          description: 'Add logging to the application',
          labels: ['logging']
        }
      });

      expect(result.injectedWarnings.length).toBeGreaterThan(0);
      expect(result.killSwitchState).toBe('INFERRED_PAUSED');
    });

    it('skips pattern creation for inferred findings during INFERRED_PAUSED', async () => {
      const killSwitchService = new KillSwitchService(db);
      await killSwitchService.pausePatternCreation({
        workspaceId,
        projectId,
        targetState: 'INFERRED_PAUSED',
        reason: 'Test'
      });

      const result = await onPRReviewComplete({
        workspaceId,
        projectId,
        issueId: 'PROJ-999',
        prNumber: 100,
        confirmedFindings: [{
          id: 'finding-inferred',
          title: 'Potential issue',
          description: 'Something might be wrong',
          scoutType: 'correctness',
          severity: 'MEDIUM',
          evidence: 'Inferred from missing validation',
          location: { file: 'src/api.ts', line: 10 }
        }],
        contextPack: { content: '', fingerprint: mockFingerprint() },
        spec: { content: '', fingerprint: mockFingerprint() }
      });

      // Should be logged but not create a pattern (for inferred)
      expect(result.skippedDueToKillSwitch).toBeDefined();
    });
  });

  describe('ProvisionalAlert Promotion', () => {
    it('promotes alert to pattern on recurrence', async () => {
      // First finding creates provisional alert (inferred, HIGH, security)
      const firstResult = await onPRReviewComplete({
        workspaceId,
        projectId,
        issueId: 'PROJ-A',
        prNumber: 1,
        confirmedFindings: [{
          id: 'finding-first',
          title: 'Potential credential exposure',
          description: 'Credentials may be logged',
          scoutType: 'security',
          severity: 'HIGH',
          evidence: 'Inferred from logging pattern',
          location: { file: 'src/auth.ts', line: 50 }
        }],
        contextPack: { content: '', fingerprint: mockFingerprint() },
        spec: { content: '', fingerprint: mockFingerprint() }
      });

      expect(firstResult.provisionalAlert).toBeDefined();
      const alertId = firstResult.provisionalAlert.id;

      // Second finding with same pattern should promote alert
      const secondResult = await onPRReviewComplete({
        workspaceId,
        projectId,
        issueId: 'PROJ-B',
        prNumber: 2,
        confirmedFindings: [{
          id: 'finding-second',
          title: 'Credential logged',
          description: 'API key written to logs',
          scoutType: 'security',
          severity: 'CRITICAL',
          evidence: 'logger.info("API Key: " + apiKey)',
          location: { file: 'src/api.ts', line: 30 }
        }],
        contextPack: { content: '', fingerprint: mockFingerprint() },
        spec: { content: '', fingerprint: mockFingerprint() }
      });

      // Alert should be promoted
      const alertRepo = new ProvisionalAlertRepository(db);
      const alert = alertRepo.findById(alertId);
      expect(alert.status).toBe('promoted');
      expect(alert.promotedToPatternId).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    it('continues processing other findings when one attribution fails', async () => {
      const result = await onPRReviewComplete({
        workspaceId,
        projectId,
        issueId: 'PROJ-ERR',
        prNumber: 999,
        confirmedFindings: [
          {
            id: 'finding-good',
            title: 'Valid finding',
            description: 'This should be processed',
            scoutType: 'correctness',
            severity: 'MEDIUM',
            evidence: 'Clear evidence',
            location: { file: 'src/valid.ts', line: 10 }
          },
          {
            id: 'finding-bad',
            title: '', // Invalid - empty title
            description: '',
            scoutType: 'invalid',
            severity: 'INVALID' as any,
            evidence: '',
            location: { file: '', line: -1 }
          }
        ],
        contextPack: { content: 'Context', fingerprint: mockFingerprint() },
        spec: { content: 'Spec', fingerprint: mockFingerprint() }
      });

      // Should have one success and one error
      expect(result.attributionResults.length).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].findingId).toBe('finding-bad');
    });
  });
});

function mockFingerprint() {
  return {
    kind: 'git' as const,
    repo: 'test/repo',
    path: '.falcon/test.md',
    commitSha: 'abc123def456'
  };
}
```

---

## 11. Kill Switch Integration

The kill switch mechanism (defined in main spec Section 11) monitors attribution health and halts pattern creation when confidence drops below acceptable thresholds. This section defines the integration points for Phase 4.

### 11.1 CLI Commands

```typescript
// File: src/cli/commands/status.ts
import type { Database } from 'better-sqlite3';
import { KillSwitchService } from '../services/kill-switch.service';
import type { Scope } from '../../schemas';

/**
 * `falcon status` - Show system status including kill switch state.
 *
 * Output includes:
 * - Current kill switch state (ACTIVE, INFERRED_PAUSED, FULLY_PAUSED)
 * - Reason for current state (if paused)
 * - Time entered current state
 * - Auto-resume time (if scheduled)
 */
export function statusCommand(db: Database, scope: Scope): void {
  const killSwitch = new KillSwitchService(db);
  const status = killSwitch.getStatus(scope);

  console.log('=== Falcon Attribution System Status ===\n');

  // Kill switch state
  const stateEmoji = {
    active: '[OK]',
    inferred_paused: '[WARN]',
    fully_paused: '[PAUSED]'
  };
  console.log(`Kill Switch State: ${stateEmoji[status.state]} ${status.state.toUpperCase()}`);

  if (status.reason) {
    console.log(`Reason: ${status.reason}`);
  }

  if (status.enteredAt) {
    console.log(`State Since: ${status.enteredAt.toISOString()}`);
  }

  if (status.autoResumeAt) {
    console.log(`Auto-Resume Scheduled: ${status.autoResumeAt.toISOString()}`);
  }

  // Brief metrics summary
  const metrics = status.metrics;
  console.log(`\nAttribution Stats (30-day rolling):`);
  console.log(`  Total: ${metrics.totalAttributions}`);
  console.log(`  Precision Score: ${(metrics.attributionPrecisionScore * 100).toFixed(1)}%`);
  console.log(`  Improvement Rate: ${(metrics.observedImprovementRate * 100).toFixed(1)}%`);
}
```

```typescript
// File: src/cli/commands/health.ts
import type { Database } from 'better-sqlite3';
import { KillSwitchService } from '../services/kill-switch.service';
import type { Scope } from '../../schemas';

/**
 * `falcon health` - View detailed attribution health metrics.
 *
 * Shows all metrics from AttributionHealthMetrics with threshold comparison.
 */
export function healthCommand(db: Database, scope: Scope): void {
  const killSwitch = new KillSwitchService(db);
  const metrics = killSwitch.getHealthMetrics(scope);
  const status = killSwitch.getStatus(scope);

  console.log('=== Attribution Health Metrics ===\n');
  console.log(`Workspace: ${scope.workspaceId}`);
  console.log(`Project: ${scope.projectId}`);
  console.log(`Current State: ${status.state.toUpperCase()}\n`);

  // Attribution counts
  console.log('Attribution Counts (30-day rolling):');
  console.log(`  Total:       ${metrics.totalAttributions}`);
  console.log(`  Verbatim:    ${metrics.verbatimAttributions}`);
  console.log(`  Paraphrase:  ${metrics.paraphraseAttributions}`);
  console.log(`  Inferred:    ${metrics.inferredAttributions}`);

  // Outcome tracking
  console.log('\nInjection Outcomes:');
  console.log(`  Without Recurrence: ${metrics.injectionsWithoutRecurrence}`);
  console.log(`  With Recurrence:    ${metrics.injectionsWithRecurrence}`);

  // Health scores with thresholds
  console.log('\nHealth Scores:');

  const precisionStatus = getThresholdStatus(
    metrics.attributionPrecisionScore,
    { healthy: 0.60, warning: 0.40 },
    'higher'
  );
  console.log(`  Attribution Precision: ${formatPercent(metrics.attributionPrecisionScore)} ${precisionStatus}`);
  console.log(`    (Healthy: >= 60%, Warning: 40-59%, Critical: < 40%)`);

  const inferredStatus = getThresholdStatus(
    metrics.inferredRatio,
    { healthy: 0.25, warning: 0.40 },
    'lower'
  );
  console.log(`  Inferred Ratio:        ${formatPercent(metrics.inferredRatio)} ${inferredStatus}`);
  console.log(`    (Healthy: <= 25%, Warning: 26-40%, Critical: > 40%)`);

  const improvementStatus = getThresholdStatus(
    metrics.observedImprovementRate,
    { healthy: 0.40, warning: 0.20 },
    'higher'
  );
  console.log(`  Improvement Rate:      ${formatPercent(metrics.observedImprovementRate)} ${improvementStatus}`);
  console.log(`    (Healthy: >= 40%, Warning: 20-39%, Critical: < 20%)`);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`.padStart(6);
}

function getThresholdStatus(
  value: number,
  thresholds: { healthy: number; warning: number },
  direction: 'higher' | 'lower'
): string {
  if (direction === 'higher') {
    if (value >= thresholds.healthy) return '[HEALTHY]';
    if (value >= thresholds.warning) return '[WARNING]';
    return '[CRITICAL]';
  } else {
    if (value <= thresholds.healthy) return '[HEALTHY]';
    if (value <= thresholds.warning) return '[WARNING]';
    return '[CRITICAL]';
  }
}
```

```typescript
// File: src/cli/commands/pause-resume.ts
import type { Database } from 'better-sqlite3';
import { KillSwitchService } from '../services/kill-switch.service';
import type { Scope } from '../../schemas';

/**
 * `falcon pause [reason]` - Manually pause pattern creation.
 *
 * Sets state to FULLY_PAUSED. Injection of existing patterns continues.
 * Requires explicit reason for audit trail.
 */
export function pauseCommand(
  db: Database,
  scope: Scope,
  reason: string
): void {
  if (!reason || reason.trim().length === 0) {
    console.error('Error: Reason is required for manual pause.');
    console.error('Usage: falcon pause "reason for pausing"');
    process.exit(1);
  }

  const killSwitch = new KillSwitchService(db);
  const currentStatus = killSwitch.getStatus(scope);

  if (currentStatus.state === 'fully_paused') {
    console.log('System is already in FULLY_PAUSED state.');
    console.log(`Current reason: ${currentStatus.reason}`);
    return;
  }

  killSwitch.pausePatternCreation(scope, reason);

  console.log('Pattern creation paused.');
  console.log(`Reason: ${reason}`);
  console.log('\nNote: Injection of existing patterns will continue.');
  console.log('Use `falcon resume` to re-enable pattern creation.');
}

/**
 * `falcon resume` - Resume pattern creation after manual pause.
 *
 * Only works if system was manually paused. Auto-paused systems
 * require metrics to recover first.
 */
export function resumeCommand(db: Database, scope: Scope): void {
  const killSwitch = new KillSwitchService(db);
  const currentStatus = killSwitch.getStatus(scope);

  if (currentStatus.state === 'active') {
    console.log('System is already in ACTIVE state. No action needed.');
    return;
  }

  // Check if auto-paused (has autoResumeAt) vs manually paused
  if (currentStatus.autoResumeAt && !currentStatus.reason?.startsWith('Manual:')) {
    console.log('Warning: System was auto-paused due to poor health metrics.');
    console.log('Current metrics should be reviewed before resuming.');
    console.log(`Auto-resume scheduled for: ${currentStatus.autoResumeAt.toISOString()}`);
    console.log('\nForcing resume anyway...');
  }

  killSwitch.resumePatternCreation(scope);

  console.log('Pattern creation resumed.');
  console.log('System is now in ACTIVE state.');
}
```

### 11.2 Observability and Logging

When the kill switch triggers (either automatically or manually), structured logs MUST be emitted for monitoring and alerting.

```typescript
// File: src/workflow/kill-switch-observer.ts
import type { Database } from 'better-sqlite3';
import type { KillSwitchStatus, AttributionHealthMetrics, Scope } from '../schemas';

/**
 * Log structure for kill switch state changes.
 * This format is designed for ingestion by logging systems (e.g., Datadog, CloudWatch).
 */
export interface KillSwitchLogEntry {
  event: 'kill_switch_triggered' | 'kill_switch_resumed' | 'kill_switch_health_check';
  timestamp: string;
  workspace_id: string;
  project_id: string;
  previous_state: string;
  new_state: string;
  reason: string;
  metrics: {
    totalAttributions: number;
    verbatimAttributions: number;
    paraphraseAttributions: number;
    inferredAttributions: number;
    attributionPrecisionScore: number;
    inferredRatio: number;
    observedImprovementRate: number;
  };
  auto_resume_at: string | null;
  triggered_by: 'automatic' | 'manual';
}

/**
 * Emit structured log when kill switch state changes.
 *
 * MUST be called by KillSwitchService whenever state transitions.
 */
export function logKillSwitchStateChange(
  scope: Scope,
  previousState: string,
  newState: string,
  reason: string,
  metrics: AttributionHealthMetrics,
  autoResumeAt: Date | null,
  triggeredBy: 'automatic' | 'manual'
): void {
  const logEntry: KillSwitchLogEntry = {
    event: newState === 'active' ? 'kill_switch_resumed' : 'kill_switch_triggered',
    timestamp: new Date().toISOString(),
    workspace_id: scope.workspaceId,
    project_id: scope.projectId,
    previous_state: previousState,
    new_state: newState,
    reason,
    metrics: {
      totalAttributions: metrics.totalAttributions,
      verbatimAttributions: metrics.verbatimAttributions,
      paraphraseAttributions: metrics.paraphraseAttributions,
      inferredAttributions: metrics.inferredAttributions,
      attributionPrecisionScore: metrics.attributionPrecisionScore,
      inferredRatio: metrics.inferredRatio,
      observedImprovementRate: metrics.observedImprovementRate
    },
    auto_resume_at: autoResumeAt?.toISOString() || null,
    triggered_by: triggeredBy
  };

  // Emit as JSON for structured logging
  console.log(JSON.stringify(logEntry));

  // Also emit to stderr for immediate visibility in terminal
  if (newState !== 'active') {
    console.error(
      `[KILL_SWITCH] Pattern creation ${newState === 'fully_paused' ? 'FULLY PAUSED' : 'INFERRED PAUSED'} ` +
      `for ${scope.workspaceId}/${scope.projectId}: ${reason}`
    );
  } else {
    console.error(
      `[KILL_SWITCH] Pattern creation RESUMED for ${scope.workspaceId}/${scope.projectId}`
    );
  }
}

/**
 * Log periodic health check results.
 *
 * Called by the weekly health check scheduled task.
 */
export function logHealthCheck(
  scope: Scope,
  status: KillSwitchStatus,
  recommendation: 'no_change' | 'should_resume' | 'should_pause' | 'should_escalate'
): void {
  const logEntry: KillSwitchLogEntry = {
    event: 'kill_switch_health_check',
    timestamp: new Date().toISOString(),
    workspace_id: scope.workspaceId,
    project_id: scope.projectId,
    previous_state: status.state,
    new_state: status.state, // No change during health check logging
    reason: `Health check: ${recommendation}`,
    metrics: {
      totalAttributions: status.metrics.totalAttributions,
      verbatimAttributions: status.metrics.verbatimAttributions,
      paraphraseAttributions: status.metrics.paraphraseAttributions,
      inferredAttributions: status.metrics.inferredAttributions,
      attributionPrecisionScore: status.metrics.attributionPrecisionScore,
      inferredRatio: status.metrics.inferredRatio,
      observedImprovementRate: status.metrics.observedImprovementRate
    },
    auto_resume_at: status.autoResumeAt?.toISOString() || null,
    triggered_by: 'automatic'
  };

  console.log(JSON.stringify(logEntry));

  // Escalation warning for FULLY_PAUSED state
  if (status.state === 'fully_paused' && recommendation === 'should_escalate') {
    console.error(
      `[KILL_SWITCH] ESCALATION: Project ${scope.projectId} has been FULLY_PAUSED ` +
      `since ${status.enteredAt?.toISOString()}. Manual review required.`
    );
  }
}
```

### 11.3 Weekly Health Check Scheduled Task

The system MUST perform automated health checks to evaluate auto-recovery eligibility. This task runs weekly per project.

```typescript
// File: src/scheduled/weekly-health-check.ts
import type { Database } from 'better-sqlite3';
import { KillSwitchService } from '../services/kill-switch.service';
import { logHealthCheck } from '../workflow/kill-switch-observer';
import type { Scope } from '../schemas';

/**
 * Configuration for the weekly health check.
 */
export interface HealthCheckConfig {
  // Cooldown periods before auto-resume is considered
  inferredPausedCooldownDays: number;  // Default: 7
  fullyPausedCooldownDays: number;     // Default: 14

  // Escalation threshold - days in FULLY_PAUSED before flagging for manual review
  escalationThresholdDays: number;     // Default: 30
}

export const DEFAULT_HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  inferredPausedCooldownDays: 7,
  fullyPausedCooldownDays: 14,
  escalationThresholdDays: 30
};

export interface HealthCheckResult {
  scope: Scope;
  previousState: string;
  newState: string;
  action: 'no_change' | 'auto_resumed' | 'escalated';
  reason: string;
}

/**
 * Run weekly health check for a single project.
 *
 * Evaluates:
 * 1. If paused and cooldown period passed, check if metrics recovered
 * 2. If metrics recovered, auto-resume to ACTIVE
 * 3. If FULLY_PAUSED for too long, flag for escalation
 *
 * Per main spec Section 11.9 (Recovery Protocol):
 * - System checks health weekly
 * - If metrics recover AND cooldown period passed, auto-resume to ACTIVE
 * - When FULLY_PAUSED, flag for human review via observability logs
 */
export function runHealthCheck(
  db: Database,
  scope: Scope,
  config: HealthCheckConfig = DEFAULT_HEALTH_CHECK_CONFIG
): HealthCheckResult {
  const killSwitch = new KillSwitchService(db);
  const status = killSwitch.getStatus(scope);

  // Already active - just log and return
  if (status.state === 'active') {
    logHealthCheck(scope, status, 'no_change');
    return {
      scope,
      previousState: 'active',
      newState: 'active',
      action: 'no_change',
      reason: 'System is active, no action needed'
    };
  }

  // Calculate days in current state
  const daysInState = status.enteredAt
    ? (Date.now() - status.enteredAt.getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  // Determine cooldown period based on state
  const requiredCooldownDays = status.state === 'fully_paused'
    ? config.fullyPausedCooldownDays
    : config.inferredPausedCooldownDays;

  // Check if cooldown period has passed
  if (daysInState < requiredCooldownDays) {
    logHealthCheck(scope, status, 'no_change');
    return {
      scope,
      previousState: status.state,
      newState: status.state,
      action: 'no_change',
      reason: `Cooldown period not yet passed (${daysInState.toFixed(1)}/${requiredCooldownDays} days)`
    };
  }

  // Check if metrics have recovered
  const metricsRecovered = evaluateMetricsRecovery(status.metrics);

  if (metricsRecovered) {
    // Auto-resume
    killSwitch.resumePatternCreation(scope);

    logHealthCheck(scope, status, 'should_resume');

    return {
      scope,
      previousState: status.state,
      newState: 'active',
      action: 'auto_resumed',
      reason: 'Metrics recovered and cooldown period passed'
    };
  }

  // Check for escalation (FULLY_PAUSED for too long)
  if (status.state === 'fully_paused' && daysInState >= config.escalationThresholdDays) {
    logHealthCheck(scope, status, 'should_escalate');

    return {
      scope,
      previousState: status.state,
      newState: status.state,
      action: 'escalated',
      reason: `FULLY_PAUSED for ${daysInState.toFixed(0)} days - manual review required`
    };
  }

  // No change
  logHealthCheck(scope, status, 'no_change');

  return {
    scope,
    previousState: status.state,
    newState: status.state,
    action: 'no_change',
    reason: `Metrics have not recovered. Precision: ${(status.metrics.attributionPrecisionScore * 100).toFixed(1)}%`
  };
}

/**
 * Evaluate if health metrics have recovered to healthy levels.
 *
 * Per main spec Section 11.3 (Health Thresholds):
 * - attributionPrecisionScore >= 0.60 (healthy)
 * - inferredRatio <= 0.25 (healthy)
 * - observedImprovementRate >= 0.40 (healthy)
 *
 * All three must be in healthy range to recover.
 */
function evaluateMetricsRecovery(metrics: AttributionHealthMetrics): boolean {
  const precisionHealthy = metrics.attributionPrecisionScore >= 0.60;
  const inferredHealthy = metrics.inferredRatio <= 0.25;
  const improvementHealthy = metrics.observedImprovementRate >= 0.40;

  return precisionHealthy && inferredHealthy && improvementHealthy;
}

/**
 * Run health checks for all projects in a workspace.
 *
 * This is the entry point for the scheduled task.
 */
export async function runWeeklyHealthChecks(
  db: Database,
  workspaceId: string,
  config: HealthCheckConfig = DEFAULT_HEALTH_CHECK_CONFIG
): Promise<HealthCheckResult[]> {
  const killSwitch = new KillSwitchService(db);
  const projectIds = killSwitch.getProjectsInWorkspace(workspaceId);

  const results: HealthCheckResult[] = [];

  for (const projectId of projectIds) {
    const scope: Scope = { workspaceId, projectId };
    const result = runHealthCheck(db, scope, config);
    results.push(result);
  }

  // Summary log
  const resumed = results.filter(r => r.action === 'auto_resumed').length;
  const escalated = results.filter(r => r.action === 'escalated').length;

  console.log(
    `[HEALTH_CHECK] Weekly check complete for workspace ${workspaceId}: ` +
    `${results.length} projects checked, ${resumed} auto-resumed, ${escalated} escalated`
  );

  return results;
}
```

### 11.4 Kill Switch Service Implementation

**OWNERSHIP NOTE:** Phase 4 owns the *full implementation* of KillSwitchService.
Phase 2 defines only the *interface contract* that AttributionOrchestrator depends on.
See: `specs/phases/phase-2-attribution-engine.md` Section 9.5 for the interface.

This implementation includes:
- Health metrics storage and calculation
- State transition logic (ACTIVE → INFERRED_PAUSED → FULLY_PAUSED)
- Manual pause/resume capability
- Auto-resume logic

```typescript
// File: src/services/kill-switch.service.ts
import type { Database } from 'better-sqlite3';
import type { Scope, KillSwitchStatus, AttributionHealthMetrics, AttributionOutcome } from '../schemas';
import { logKillSwitchStateChange } from '../workflow/kill-switch-observer';

/**
 * Per main spec Section 11.4:
 */
export enum PatternCreationState {
  ACTIVE = 'active',
  INFERRED_PAUSED = 'inferred_paused',
  FULLY_PAUSED = 'fully_paused'
}

/**
 * Kill switch service implementing the API from main spec Section 11.7.
 */
export class KillSwitchService {
  constructor(private db: Database) {}

  /**
   * Get current kill switch status for a scope.
   */
  getStatus(scope: Scope): KillSwitchStatus {
    const row = this.db.prepare(`
      SELECT state, reason, entered_at, auto_resume_at
      FROM kill_switch_status
      WHERE workspace_id = ? AND project_id = ?
    `).get(scope.workspaceId, scope.projectId) as Record<string, unknown> | undefined;

    const metrics = this.getHealthMetrics(scope);

    if (!row) {
      // Default: active state
      return {
        state: PatternCreationState.ACTIVE,
        reason: null,
        enteredAt: null,
        metrics,
        autoResumeAt: null
      };
    }

    return {
      state: row.state as PatternCreationState,
      reason: row.reason as string | null,
      enteredAt: row.entered_at ? new Date(row.entered_at as string) : null,
      metrics,
      autoResumeAt: row.auto_resume_at ? new Date(row.auto_resume_at as string) : null
    };
  }

  /**
   * Get health metrics for a scope (30-day rolling window).
   */
  getHealthMetrics(scope: Scope): AttributionHealthMetrics {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Attribution counts
    const attributions = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN carrier_quote_type = 'verbatim' THEN 1 ELSE 0 END) as verbatim,
        SUM(CASE WHEN carrier_quote_type = 'paraphrase' THEN 1 ELSE 0 END) as paraphrase,
        SUM(CASE WHEN carrier_quote_type = 'inferred' THEN 1 ELSE 0 END) as inferred
      FROM attribution_outcomes
      WHERE workspace_id = ? AND project_id = ? AND created_at >= ?
    `).get(scope.workspaceId, scope.projectId, thirtyDaysAgo) as Record<string, number>;

    // Outcome tracking
    const outcomes = this.db.prepare(`
      SELECT
        SUM(CASE WHEN recurrence_observed = 0 THEN 1 ELSE 0 END) as without_recurrence,
        SUM(CASE WHEN recurrence_observed = 1 THEN 1 ELSE 0 END) as with_recurrence
      FROM attribution_outcomes
      WHERE workspace_id = ? AND project_id = ? AND created_at >= ?
        AND injection_occurred = 1 AND recurrence_observed IS NOT NULL
    `).get(scope.workspaceId, scope.projectId, thirtyDaysAgo) as Record<string, number>;

    const total = attributions.total || 0;
    const verbatim = attributions.verbatim || 0;
    const withoutRecurrence = outcomes.without_recurrence || 0;
    const totalInjections = (outcomes.without_recurrence || 0) + (outcomes.with_recurrence || 0);

    return {
      totalAttributions: total,
      verbatimAttributions: verbatim,
      paraphraseAttributions: attributions.paraphrase || 0,
      inferredAttributions: attributions.inferred || 0,
      injectionsWithoutRecurrence: withoutRecurrence,
      injectionsWithRecurrence: outcomes.with_recurrence || 0,
      attributionPrecisionScore: total > 0 ? verbatim / total : 1.0,
      inferredRatio: total > 0 ? (attributions.inferred || 0) / total : 0.0,
      observedImprovementRate: totalInjections > 0 ? withoutRecurrence / totalInjections : 1.0
    };
  }

  /**
   * Manually pause pattern creation.
   */
  pausePatternCreation(scope: Scope, reason: string): void {
    const currentStatus = this.getStatus(scope);
    const newState = PatternCreationState.FULLY_PAUSED;

    // Calculate auto-resume date (14 days for fully paused)
    const autoResumeAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    this.upsertStatus(scope, newState, `Manual: ${reason}`, autoResumeAt);

    logKillSwitchStateChange(
      scope,
      currentStatus.state,
      newState,
      `Manual: ${reason}`,
      currentStatus.metrics,
      autoResumeAt,
      'manual'
    );
  }

  /**
   * Resume pattern creation.
   */
  resumePatternCreation(scope: Scope): void {
    const currentStatus = this.getStatus(scope);
    const newState = PatternCreationState.ACTIVE;

    this.upsertStatus(scope, newState, null, null);

    logKillSwitchStateChange(
      scope,
      currentStatus.state,
      newState,
      'Resumed',
      currentStatus.metrics,
      null,
      'manual'
    );
  }

  /**
   * Record an attribution outcome for health tracking.
   */
  recordAttributionOutcome(scope: Scope, outcome: AttributionOutcome): void {
    this.db.prepare(`
      INSERT INTO attribution_outcomes (
        workspace_id, project_id, issue_key, carrier_quote_type,
        pattern_created, injection_occurred, recurrence_observed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      scope.workspaceId,
      scope.projectId,
      outcome.issueKey,
      outcome.carrierQuoteType,
      outcome.patternCreated ? 1 : 0,
      outcome.injectionOccurred ? 1 : 0,
      outcome.recurrenceObserved,
      new Date().toISOString()
    );

    // Evaluate health after each outcome
    this.evaluateHealth(scope);
  }

  /**
   * Evaluate health and potentially transition state.
   */
  evaluateHealth(scope: Scope): void {
    const currentStatus = this.getStatus(scope);
    const metrics = currentStatus.metrics;

    // Determine if state should change based on thresholds
    let newState = currentStatus.state;
    let reason: string | null = null;

    if (currentStatus.state === PatternCreationState.ACTIVE) {
      // Check if should pause
      if (metrics.attributionPrecisionScore < 0.40) {
        newState = PatternCreationState.FULLY_PAUSED;
        reason = `attributionPrecisionScore dropped to ${(metrics.attributionPrecisionScore * 100).toFixed(1)}%`;
      } else if (metrics.inferredRatio > 0.40) {
        newState = PatternCreationState.INFERRED_PAUSED;
        reason = `inferredRatio increased to ${(metrics.inferredRatio * 100).toFixed(1)}%`;
      } else if (metrics.observedImprovementRate < 0.20) {
        newState = PatternCreationState.FULLY_PAUSED;
        reason = `observedImprovementRate dropped to ${(metrics.observedImprovementRate * 100).toFixed(1)}%`;
      }
    } else if (currentStatus.state === PatternCreationState.INFERRED_PAUSED) {
      // Check if should escalate to fully paused
      if (metrics.attributionPrecisionScore < 0.40 || metrics.observedImprovementRate < 0.20) {
        newState = PatternCreationState.FULLY_PAUSED;
        reason = 'Metrics worsened while in INFERRED_PAUSED state';
      }
    }

    // Apply state change if needed
    if (newState !== currentStatus.state) {
      const autoResumeAt = new Date(
        Date.now() + (newState === PatternCreationState.FULLY_PAUSED ? 14 : 7) * 24 * 60 * 60 * 1000
      );

      this.upsertStatus(scope, newState, reason, autoResumeAt);

      logKillSwitchStateChange(
        scope,
        currentStatus.state,
        newState,
        reason!,
        metrics,
        autoResumeAt,
        'automatic'
      );
    }
  }

  /**
   * Get all project IDs in a workspace (for bulk health checks).
   */
  getProjectsInWorkspace(workspaceId: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT project_id FROM kill_switch_status WHERE workspace_id = ?
      UNION
      SELECT DISTINCT project_id FROM attribution_outcomes WHERE workspace_id = ?
    `).all(workspaceId, workspaceId) as Array<{ project_id: string }>;

    return rows.map(r => r.project_id);
  }

  private upsertStatus(
    scope: Scope,
    state: PatternCreationState,
    reason: string | null,
    autoResumeAt: Date | null
  ): void {
    this.db.prepare(`
      INSERT INTO kill_switch_status (workspace_id, project_id, state, reason, entered_at, auto_resume_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, project_id) DO UPDATE SET
        state = excluded.state,
        reason = excluded.reason,
        entered_at = excluded.entered_at,
        auto_resume_at = excluded.auto_resume_at
    `).run(
      scope.workspaceId,
      scope.projectId,
      state,
      reason,
      new Date().toISOString(),
      autoResumeAt?.toISOString() || null
    );
  }
}
```

### 11.5 Schema Additions for Kill Switch

```sql
-- Migration: Add kill switch tables
-- File: migrations/005_add_kill_switch_tables.sql

-- Kill switch status per project
CREATE TABLE kill_switch_status (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  reason TEXT,
  entered_at TEXT NOT NULL,
  auto_resume_at TEXT,
  PRIMARY KEY (workspace_id, project_id)
);

-- Attribution outcomes for health metric calculation
CREATE TABLE attribution_outcomes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  issue_key TEXT NOT NULL,
  carrier_quote_type TEXT NOT NULL,  -- 'verbatim', 'paraphrase', 'inferred'
  pattern_created INTEGER NOT NULL,   -- 0 or 1
  injection_occurred INTEGER NOT NULL, -- 0 or 1
  recurrence_observed INTEGER,        -- 0, 1, or NULL if not yet known
  created_at TEXT NOT NULL
);

-- Index for 30-day rolling window queries
CREATE INDEX idx_attribution_outcomes_scope_date
ON attribution_outcomes(workspace_id, project_id, created_at);

-- Index for recurrence updates
CREATE INDEX idx_attribution_outcomes_issue
ON attribution_outcomes(workspace_id, project_id, issue_key);
```

---

## 12. Acceptance Criteria

Phase 4 is complete when:

1. [ ] Context Pack hook injects warnings before agent runs
2. [ ] Spec hook injects warnings with refined TaskProfile
3. [ ] PR Review hook triggers attribution for confirmed findings
4. [ ] InjectionLog created for each injection
5. [ ] Adherence tracking updates wasInjected/wasAdheredTo
6. [ ] Tagging misses detected and recorded
7. [ ] E2E test passes full workflow
8. [ ] Kill switch CLI commands implemented (`falcon status`, `falcon health`, `falcon pause`, `falcon resume`)
9. [ ] Kill switch state changes emit structured logs
10. [ ] Weekly health check scheduled task evaluates auto-recovery

---

## 13. Handoff to Phase 5

After Phase 4, the full feedback loop is operational:

- Issues get warnings injected
- PR reviews trigger attribution
- Adherence is tracked
- Tagging misses are recorded

Phase 5 (Monitoring & Evolution) will add:
- Doc change invalidation
- Confidence decay processing
- Metrics dashboard
