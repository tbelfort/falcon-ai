# Phase 4: Integration & Workflow

**Parent Document:** `specs/implementation-plan-master.md` (v1.0)
**Dependencies:** Phase 1 (Data Layer), Phase 2 (Attribution), Phase 3 (Injection)
**Outputs Required By:** Phase 5 (Monitoring)

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
import { formatWarningsForInjection, formatWarningsSummary } from '../injection/formatter';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';
import { v4 as uuidv4 } from 'uuid';

export interface ContextPackHookInput {
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

  // Step 2: Select warnings for injection
  const warnings = selectWarningsForInjection(
    db,
    'context-pack',
    taskProfile,
    6 // Max warnings
  );

  // Step 3: Format warnings as markdown
  const warningsMarkdown = formatWarningsForInjection(warnings);

  // Step 4: Log the injection (v1.0: includes injectedAlerts)
  const injectionLogRepo = new InjectionLogRepository(db);
  const injectionLog = injectionLogRepo.create({
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
import { formatWarningsForInjection, formatWarningsSummary } from '../injection/formatter';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';

export interface ContextPackMetadata {
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

  // Step 2: Select warnings for spec agent
  const warnings = selectWarningsForInjection(
    db,
    'spec',
    taskProfile,
    6
  );

  // Step 3: Format warnings
  const warningsMarkdown = formatWarningsForInjection(warnings);

  // Step 4: Log injection (v1.0: includes injectedAlerts)
  const injectionLogRepo = new InjectionLogRepository(db);
  const injectionLog = injectionLogRepo.create({
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
import type { DocFingerprint } from '../schemas';
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
  prNumber: number;
  issueId: string;
  verdict: 'PASS' | 'FAIL';
  confirmedFindings: ConfirmedFinding[];
}

export interface DocumentContext {
  content: string;
  path: string;
  commitSha: string;
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
 */
export async function onPRReviewComplete(
  db: Database,
  result: PRReviewResult,
  contextPack: DocumentContext,
  spec: DocumentContext
): Promise<PRReviewHookOutput> {
  const orchestrator = new AttributionOrchestrator(db);
  const attributionResults: AttributionResult[] = [];

  // Build fingerprints
  const contextPackFingerprint: DocFingerprint = {
    kind: 'git',
    repo: 'current',
    path: contextPack.path,
    commitSha: contextPack.commitSha
  };

  const specFingerprint: DocFingerprint = {
    kind: 'git',
    repo: 'current',
    path: spec.path,
    commitSha: spec.commitSha
  };

  // Process each confirmed finding
  for (const finding of result.confirmedFindings) {
    try {
      const attributionResult = await orchestrator.attributeFinding({
        finding: {
          ...finding,
          issueId: result.issueId,
          prNumber: result.prNumber
        },
        contextPack: {
          content: contextPack.content,
          fingerprint: contextPackFingerprint
        },
        spec: {
          content: spec.content,
          fingerprint: specFingerprint
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

  // Update adherence tracking
  await updateAdherence(db, result);

  // Check for tagging misses
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

/**
 * Check if a ProvisionalAlert should be promoted to a Pattern.
 *
 * Called during occurrence creation to check if the pattern gate is now met.
 */
export function checkAndPromoteAlert(
  db: Database,
  alertId: string,
  config: PatternGateConfig = DEFAULT_PATTERN_GATE
): PromotionResult {
  const alertRepo = new ProvisionalAlertRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);

  // Get the provisional alert
  const alert = alertRepo.findById(alertId);
  if (!alert) {
    return { promoted: false, alertId, reason: 'Alert not found' };
  }

  // Already promoted?
  if (alert.status === 'promoted') {
    return { promoted: false, alertId, reason: 'Already promoted' };
  }

  // Get all occurrences linked to this alert
  const occurrences = occurrenceRepo.findByProvisionalAlertId(alertId);

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

  // Pattern gate met - promote the alert
  const pattern = patternRepo.createFromProvisionalAlert(alert, {
    occurrenceCount: occurrences.length,
    uniqueIssueCount: uniqueIssues.size,
    averageConfidence: avgConfidence
  });

  // Update alert status
  alertRepo.updateStatus(alertId, 'promoted', pattern.id);

  // Link occurrences to the new pattern
  for (const occurrence of occurrences) {
    occurrenceRepo.update(occurrence.id, {
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
 */
export function onOccurrenceCreated(
  db: Database,
  occurrenceId: string,
  provisionalAlertId?: string
): PromotionResult | null {
  if (!provisionalAlertId) {
    return null;
  }

  return checkAndPromoteAlert(db, provisionalAlertId);
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
 */
export async function updateAdherence(
  db: Database,
  result: PRReviewResult
): Promise<{ updated: number }> {
  const injectionLogRepo = new InjectionLogRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  let updated = 0;

  // Get all injection logs for this issue
  const logs = injectionLogRepo.findByIssueId(result.issueId);

  for (const log of logs) {
    // Check each injected pattern
    for (const patternId of log.injectedPatterns) {
      const pattern = patternRepo.findById(patternId);
      if (!pattern) continue;

      // Check if there's a finding for this pattern
      const hasRelatedFinding = checkForRelatedFinding(
        pattern,
        result.confirmedFindings
      );

      // Find the occurrence (if any) for this pattern + issue
      const occurrence = occurrenceRepo.findByPatternAndIssue(
        patternId,
        result.issueId
      );

      if (occurrence) {
        // Update existing occurrence
        occurrenceRepo.update(occurrence.id, {
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

function mapScoutToCategory(scoutType: string): string {
  const mapping: Record<string, string> = {
    adversarial: 'security',
    security: 'security',
    bugs: 'correctness',
    tests: 'testing',
    docs: 'compliance',
    spec: 'compliance',
    decisions: 'compliance'
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
 */
export async function checkForTaggingMisses(
  db: Database,
  result: PRReviewResult,
  attributionResults: AttributionResult[]
): Promise<number> {
  const injectionLogRepo = new InjectionLogRepository(db);
  const taggingMissRepo = new TaggingMissRepository(db);

  let missCount = 0;

  // Get injection logs for this issue
  const logs = injectionLogRepo.findByIssueId(result.issueId);
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
      // This is a tagging miss
      taggingMissRepo.create({
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
 * Extended InjectionLog interface with alert tracking (v1.0).
 */
export interface InjectionLogV1 extends InjectionLog {
  /** IDs of injected ProvisionalAlerts (v1.0 addition) */
  injectedAlerts: string[];
}

type CreateInput = Omit<InjectionLogV1, 'id' | 'injectedAt'>;

export class InjectionLogRepository extends BaseRepository<InjectionLogV1> {

  findById(id: string): InjectionLogV1 | null {
    const row = this.db.prepare(
      'SELECT * FROM injection_logs WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  findByIssueId(issueId: string): InjectionLogV1[] {
    const rows = this.db.prepare(
      'SELECT * FROM injection_logs WHERE issue_id = ? ORDER BY injected_at DESC'
    ).all(issueId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  findByTarget(issueId: string, target: 'context-pack' | 'spec'): InjectionLogV1 | null {
    const row = this.db.prepare(
      'SELECT * FROM injection_logs WHERE issue_id = ? AND target = ?'
    ).get(issueId, target) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all logs that injected a specific alert.
   * Useful for tracking alert effectiveness.
   */
  findByAlertId(alertId: string): InjectionLogV1[] {
    const rows = this.db.prepare(
      `SELECT * FROM injection_logs
       WHERE json_extract(injected_alerts, '$') LIKE ?
       ORDER BY injected_at DESC`
    ).all(`%"${alertId}"%`) as Record<string, unknown>[];

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

    this.db.prepare(`
      INSERT INTO injection_logs (
        id, issue_id, target, injected_patterns, injected_principles,
        injected_alerts, task_profile, injected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
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

### 9.2 Schema Migration for injectedAlerts

```sql
-- Migration: Add injected_alerts column to injection_logs table
-- File: migrations/004_add_injected_alerts.sql

ALTER TABLE injection_logs
ADD COLUMN injected_alerts TEXT DEFAULT '[]';

-- Create index for alert lookup
CREATE INDEX idx_injection_logs_alerts
ON injection_logs(json_extract(injected_alerts, '$'));
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

  // === CONTEXT PACK PHASE ===
  const cpResult = beforeContextPackAgent(db, {
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
  const specResult = beforeSpecAgent(db, {
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
  const reviewResult = await onPRReviewComplete(
    db,
    {
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
      path: 'context-packs/CON-123.md',
      commitSha: 'abc123'
    },
    {
      content: '... spec content ...',
      path: 'specs/CON-123.md',
      commitSha: 'abc123'
    }
  );

  console.log(`[Attribution] Results:`, reviewResult.summary);
  console.log(`[Attribution] Tagging misses: ${reviewResult.taggingMisses}`);
}
```

---

## 11. Acceptance Criteria

Phase 4 is complete when:

1. [ ] Context Pack hook injects warnings before agent runs
2. [ ] Spec hook injects warnings with refined TaskProfile
3. [ ] PR Review hook triggers attribution for confirmed findings
4. [ ] InjectionLog created for each injection
5. [ ] Adherence tracking updates wasInjected/wasAdheredTo
6. [ ] Tagging misses detected and recorded
7. [ ] E2E test passes full workflow

---

## 12. Handoff to Phase 5

After Phase 4, the full feedback loop is operational:

- Issues get warnings injected
- PR reviews trigger attribution
- Adherence is tracked
- Tagging misses are recorded

Phase 5 (Monitoring & Evolution) will add:
- Doc change invalidation
- Confidence decay processing
- Metrics dashboard
