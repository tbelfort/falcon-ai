# Phase 5: Monitoring & Evolution

**Parent Document:** `specs/implementation-plan-master.md` (v1.0)
**Dependencies:** Phase 1-4 (Full system operational)
**Outputs:** Continuous improvement capabilities

---

## 1. Overview

This phase adds monitoring and evolution capabilities:
- Source document change detection and invalidation
- Confidence decay processing
- Tagging miss resolution
- Metrics and dashboard

---

## 2. Deliverables Checklist

- [ ] `src/evolution/doc-change-watcher.ts` - Document change handling (v1.0: fingerprint branching, excerptHash)
- [ ] `src/evolution/decay-processor.ts` - Confidence decay
- [ ] `src/evolution/provisional-alert-processor.ts` - v1.0: ProvisionalAlert expiry and promotion
- [ ] `src/evolution/salience-detector.ts` - v1.0: SalienceIssue detection (3+ in 30 days)
- [ ] `src/evolution/tagging-miss-resolver.ts` - Resolution suggestions
- [ ] `src/metrics/collector.ts` - Metrics collection
- [ ] `src/metrics/reporter.ts` - Metrics reporting
- [ ] `tests/evolution/*.test.ts` - Evolution tests

---

## 3. Document Change Detection

### 3.1 Implementation

```typescript
// File: src/evolution/doc-change-watcher.ts
import type { Database } from 'better-sqlite3';
import type { DocFingerprint } from '../schemas';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { computePatternStats } from '../injection/confidence';
import { createHash } from 'crypto';

/**
 * Document fingerprint types for matching occurrences.
 * v1.0: Branching by fingerprint.kind for proper document matching.
 */
export interface DocFingerprint {
  kind: 'git' | 'linear' | 'web' | 'external';
  // git: (repo, path)
  repo?: string;
  path?: string;
  commitSha?: string;
  // linear: docId
  docId?: string;
  // web: url
  url?: string;
  // external: id
  id?: string;
}

export interface DocChange {
  fingerprint: DocFingerprint;
  newContent: string;
  changedSections?: string[]; // Optional: specific sections that changed
  excerptHashes?: Map<string, string>; // section -> hash for section-level detection
}

export interface DocChangeResult {
  invalidatedOccurrences: number;
  archivedPatterns: string[];
  affectedPatternIds: string[];
}

/**
 * Compute hash for a content excerpt (used for section-level change detection).
 * v1.0: excerptHash enables fine-grained invalidation.
 *
 * NOTE: Returns full 64-char SHA-256 hash (not truncated per v1.0 spec).
 * PatternOccurrence.carrierExcerptHash and originExcerptHash are length(64).
 */
export function computeExcerptHash(content: string): string {
  return createHash('sha256')
    .update(content.trim().toLowerCase())
    .digest('hex');  // Full 64-char hash per v1.0 spec
}

/**
 * Handle document changes and invalidate affected occurrences.
 * See Spec Section 7.2 (v1.0).
 *
 * When a source document changes:
 * 1. Find all occurrences citing this doc (branch by fingerprint.kind)
 * 2. Check if the specific cited section changed (using excerptHash)
 * 3. If yes, mark occurrence as inactive
 * 4. Recompute pattern stats
 * 5. Archive patterns with no active occurrences
 */
export async function onDocumentChange(
  db: Database,
  change: DocChange
): Promise<DocChangeResult> {
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  const result: DocChangeResult = {
    invalidatedOccurrences: 0,
    archivedPatterns: [],
    affectedPatternIds: []
  };

  // Find occurrences by fingerprint.kind (v1.0 branching logic)
  let affectedOccurrences: PatternOccurrence[];

  switch (change.fingerprint.kind) {
    case 'git':
      // Match on (repo, path)
      affectedOccurrences = occurrenceRepo.findByGitDoc(
        change.fingerprint.repo!,
        change.fingerprint.path!
      );
      break;

    case 'linear':
      // Match on docId
      affectedOccurrences = occurrenceRepo.findByLinearDocId(
        change.fingerprint.docId!
      );
      break;

    case 'web':
      // Match on url
      affectedOccurrences = occurrenceRepo.findByWebUrl(
        change.fingerprint.url!
      );
      break;

    case 'external':
      // Match on id
      affectedOccurrences = occurrenceRepo.findByExternalId(
        change.fingerprint.id!
      );
      break;

    default:
      affectedOccurrences = [];
  }

  const affectedPatternIds = new Set<string>();

  for (const occurrence of affectedOccurrences) {
    // Check if the specific cited section changed using excerptHash
    const sectionChanged = checkSectionChanged(
      occurrence.evidence.carrierLocation,
      occurrence.evidence.carrierQuote,
      occurrence.carrierExcerptHash, // v1.0: excerptHash is on occurrence, not evidence
      change.newContent,
      change.changedSections,
      change.excerptHashes
    );

    if (sectionChanged) {
      // Invalidate occurrence
      occurrenceRepo.update(occurrence.id, {
        status: 'inactive',
        inactiveReason: 'superseded_doc'
      });
      result.invalidatedOccurrences++;
      affectedPatternIds.add(occurrence.patternId);
    }
  }

  result.affectedPatternIds = Array.from(affectedPatternIds);

  // Recompute stats and archive patterns if needed
  for (const patternId of affectedPatternIds) {
    const pattern = patternRepo.findById(patternId);
    if (!pattern || pattern.permanent) continue;

    const stats = computePatternStats(patternId, occurrenceRepo);

    // Archive if no active occurrences
    if (stats.activeOccurrences === 0) {
      patternRepo.update(patternId, { status: 'archived' });
      result.archivedPatterns.push(patternId);
    }
  }

  return result;
}

/**
 * Check if a specific section changed in the new content.
 * v1.0: Uses excerptHash for efficient section-level change detection.
 */
function checkSectionChanged(
  location: string,
  quote: string,
  storedExcerptHash: string | undefined,
  newContent: string,
  changedSections?: string[],
  newExcerptHashes?: Map<string, string>
): boolean {
  // v1.0: If we have excerptHash, use hash comparison for efficiency
  if (storedExcerptHash && newExcerptHashes) {
    const newHash = newExcerptHashes.get(location);
    if (newHash) {
      // Hash mismatch means section changed
      return storedExcerptHash !== newHash;
    }
    // Section no longer exists in new content
    return true;
  }

  // If we have explicit changed sections, check those
  if (changedSections && changedSections.length > 0) {
    // Check if location overlaps with changed sections
    for (const section of changedSections) {
      if (location.includes(section) || section.includes(location)) {
        return true;
      }
    }
    return false;
  }

  // Fallback: check if the quote still exists
  const normalizedQuote = quote.toLowerCase().trim();
  const normalizedContent = newContent.toLowerCase();

  // Exact match check
  if (!normalizedContent.includes(normalizedQuote)) {
    return true; // Quote no longer exists
  }

  // v1.0: Compute hash on-the-fly if no pre-computed hashes
  if (storedExcerptHash) {
    const currentHash = computeExcerptHash(quote);
    // Find the quote in new content and hash it
    const quoteIndex = normalizedContent.indexOf(normalizedQuote);
    if (quoteIndex >= 0) {
      const extractedQuote = newContent.substring(
        quoteIndex,
        quoteIndex + quote.length
      );
      const newHash = computeExcerptHash(extractedQuote);
      return storedExcerptHash !== newHash;
    }
  }

  return false;
}

/**
 * Process a git diff to find document changes.
 */
export function parseGitDiff(diffOutput: string): DocChange[] {
  const changes: DocChange[] = [];

  // Parse diff output (simplified)
  const fileRegex = /^diff --git a\/(.+) b\/(.+)$/gm;
  let match;

  while ((match = fileRegex.exec(diffOutput)) !== null) {
    const path = match[2];
    if (path.endsWith('.md')) {
      changes.push({
        path,
        oldCommitSha: '', // Would be extracted from diff header
        newCommitSha: '', // Would be extracted from diff header
        newContent: '' // Would read new file content
      });
    }
  }

  return changes;
}
```

---

## 4. Confidence Decay Processor

### 4.1 Implementation

```typescript
// File: src/evolution/decay-processor.ts
import type { Database } from 'better-sqlite3';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { computeAttributionConfidence, computePatternStats } from '../injection/confidence';

export interface DecayProcessResult {
  processed: number;
  archived: number;
  belowThreshold: string[];
}

const ARCHIVE_THRESHOLD = 0.2;

/**
 * Process confidence decay for all non-permanent patterns.
 * Run periodically (e.g., daily).
 *
 * Decay formula (from spec):
 * decayPenalty = min(daysSinceLastActiveOccurrence / 90, 1.0) * 0.15
 */
export async function processConfidenceDecay(
  db: Database
): Promise<DecayProcessResult> {
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);

  const result: DecayProcessResult = {
    processed: 0,
    archived: 0,
    belowThreshold: []
  };

  // Get all active, non-permanent patterns
  const patterns = patternRepo.findActive()
    .filter(p => !p.permanent);

  for (const pattern of patterns) {
    const stats = computePatternStats(pattern.id, occurrenceRepo);
    const confidence = computeAttributionConfidence(pattern, stats);

    result.processed++;

    if (confidence < ARCHIVE_THRESHOLD) {
      // Pattern has decayed below threshold
      if (stats.activeOccurrences === 0) {
        // Archive it
        patternRepo.update(pattern.id, { status: 'archived' });
        result.archived++;
      } else {
        // Mark for review (still has occurrences)
        result.belowThreshold.push(pattern.id);
      }
    }
  }

  return result;
}

/**
 * Get patterns approaching decay threshold.
 * Useful for monitoring dashboard.
 */
export function getPatternsNearingDecay(
  db: Database,
  threshold: number = 0.3
): Array<{ pattern: PatternDefinition; confidence: number; daysUntilThreshold: number }> {
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);

  const patterns = patternRepo.findActive()
    .filter(p => !p.permanent);

  const results: Array<{
    pattern: PatternDefinition;
    confidence: number;
    daysUntilThreshold: number;
  }> = [];

  for (const pattern of patterns) {
    const stats = computePatternStats(pattern.id, occurrenceRepo);
    const confidence = computeAttributionConfidence(pattern, stats);

    if (confidence < threshold && confidence >= ARCHIVE_THRESHOLD) {
      // Estimate days until archive threshold
      const daysUntilThreshold = estimateDaysUntilThreshold(
        confidence,
        ARCHIVE_THRESHOLD
      );

      results.push({
        pattern,
        confidence,
        daysUntilThreshold
      });
    }
  }

  return results.sort((a, b) => a.daysUntilThreshold - b.daysUntilThreshold);
}

function estimateDaysUntilThreshold(
  currentConfidence: number,
  threshold: number
): number {
  // Simplified linear estimate
  // Real decay is more complex, this is approximate
  const decayPerDay = 0.15 / 90; // Max decay over 90 days
  const confidenceToLose = currentConfidence - threshold;
  return Math.floor(confidenceToLose / decayPerDay);
}
```

---

## 5. ProvisionalAlert Processing (v1.0)

### 5.1 ProvisionalAlert Expiry

```typescript
// File: src/evolution/provisional-alert-processor.ts
import type { Database } from 'better-sqlite3';
import type { Touch } from '../schemas';
import { ProvisionalAlertRepository } from '../storage/repositories/provisional-alert.repo';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';

/**
 * ProvisionalAlert (v1.0 schema - aligned with Phase 1)
 *
 * Short-lived alerts for CRITICAL findings that don't meet pattern gate (2+ occurrences).
 * TTL: 14 days. If same issue recurs within TTL, promote to full PatternDefinition.
 */
export interface ProvisionalAlert {
  id: string;                           // UUID
  findingId: string;                    // From PR Review
  issueId: string;                      // CON-123
  message: string;                      // Short actionable warning
  touches: Touch[];                     // For injection filtering
  injectInto: 'context-pack' | 'spec' | 'both';
  expiresAt: string;                    // ISO 8601, default: createdAt + 14 days
  status: 'active' | 'expired' | 'promoted';
  promotedToPatternId?: string;         // If promoted to full pattern
  createdAt: string;                    // ISO 8601
}

export interface ExpiryProcessResult {
  expired: number;
  promoted: number;
  promotedPatternIds: string[];
}

const PROVISIONAL_ALERT_TTL_DAYS = 14; // v1.0: 14 days TTL
// NOTE: Promotion happens when same issue recurs, not based on occurrence count

/**
 * Process ProvisionalAlert expiry.
 * v1.0: Alerts expire after 14 days if not promoted.
 */
export async function processProvisionalAlertExpiry(
  db: Database
): Promise<ExpiryProcessResult> {
  const alertRepo = new ProvisionalAlertRepository(db);

  const result: ExpiryProcessResult = {
    expired: 0,
    promoted: 0,
    promotedPatternIds: []
  };

  const now = new Date();
  const activeAlerts = alertRepo.findByStatus('active');

  for (const alert of activeAlerts) {
    const expiresAt = new Date(alert.expiresAt);

    if (now >= expiresAt) {
      // v1.0: Check for recurrence by looking for matching patterns created since alert
      const patternRepo = new PatternDefinitionRepository(db);
      const matchingPatterns = patternRepo.findByTouchesAndCategory(
        alert.touches,
        'security',
        alert.createdAt  // Only patterns created after alert
      );

      if (matchingPatterns.length > 0) {
        // Recurrence detected - promote to full pattern
        alertRepo.update(alert.id, {
          status: 'promoted',
          promotedToPatternId: matchingPatterns[0].id
        });
        result.promoted++;
        result.promotedPatternIds.push(matchingPatterns[0].id);
        continue;
      }

      // No recurrence - expire the alert
      alertRepo.update(alert.id, {
        status: 'expired'
      });
      result.expired++;
    }
  }

  return result;
}

/**
 * Create a new ProvisionalAlert from a HIGH/CRITICAL security finding (v1.0 schema).
 *
 * v1.0 ProvisionalAlert fields:
 * - findingId, issueId: Source finding reference
 * - message: Short actionable warning
 * - touches: For injection filtering
 * - injectInto: 'context-pack' | 'spec' | 'both'
 * - expiresAt: Default 14 days
 * - status: 'active' | 'expired' | 'promoted'
 */
export function createProvisionalAlert(
  db: Database,
  params: {
    findingId: string;
    issueId: string;
    message: string;
    touches: Touch[];
    injectInto: 'context-pack' | 'spec' | 'both';
  }
): ProvisionalAlert {
  const alertRepo = new ProvisionalAlertRepository(db);

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + PROVISIONAL_ALERT_TTL_DAYS);

  const alert: ProvisionalAlert = {
    id: crypto.randomUUID(),
    findingId: params.findingId,
    issueId: params.issueId,
    message: params.message,
    touches: params.touches,
    injectInto: params.injectInto,
    expiresAt: expiresAt.toISOString(),
    status: 'active',
    createdAt: now.toISOString()
  };

  alertRepo.create(alert);
  return alert;
}
```

### 5.2 ProvisionalAlert Promotion

```typescript
// Continued in: src/evolution/provisional-alert-processor.ts

export interface PromotionResult {
  success: boolean;
  patternId?: string;
  reason?: string;
}

/**
 * Promote a ProvisionalAlert to a full PatternDefinition.
 * v1.0: Promotion occurs when a similar pattern is created during the alert window.
 *
 * Note: In v1.0, promotion happens when the same issue recurs and creates a pattern.
 * The alert itself doesn't track occurrence counts - it watches for pattern creation.
 */
export async function promoteProvisionalAlert(
  db: Database,
  alert: ProvisionalAlert,
  matchingPatternId: string
): Promise<PromotionResult> {
  const alertRepo = new ProvisionalAlertRepository(db);

  // Update alert status to promoted
  alertRepo.update(alert.id, {
    status: 'promoted',
    promotedToPatternId: matchingPatternId
  });

  console.log(`[ProvisionalAlert] Promoted alert ${alert.id} to pattern ${matchingPatternId}`);

  return {
    success: true,
    patternId: matchingPatternId
  };
}

/**
 * Check if a new finding matches an active ProvisionalAlert.
 * v1.0: Match by touches overlap and security category.
 *
 * If match found, the alert should be promoted (finding recurred).
 */
export function findMatchingAlert(
  db: Database,
  touches: Touch[],
  findingCategory: string
): ProvisionalAlert | null {
  const alertRepo = new ProvisionalAlertRepository(db);

  // Only match security-related findings
  if (findingCategory !== 'security') {
    return null;
  }

  const activeAlerts = alertRepo.findByStatus('active');

  for (const alert of activeAlerts) {
    // Check for touch overlap
    const hasOverlap = alert.touches.some(t => touches.includes(t));
    if (hasOverlap) {
      return alert;
    }
  }

  return null;
}

/**
 * Handle recurrence: when a similar finding is detected while an alert is active.
 * v1.0: This triggers promotion - the alert has proven its value by predicting recurrence.
 */
export async function handleAlertRecurrence(
  db: Database,
  alertId: string,
  newPatternId: string
): Promise<PromotionResult> {
  const alertRepo = new ProvisionalAlertRepository(db);

  const alert = alertRepo.findById(alertId);
  if (!alert || alert.status !== 'active') {
    return { success: false, reason: 'Alert not found or not active' };
  }

  // Recurrence detected - promote immediately
  return promoteProvisionalAlert(db, alert, newPatternId);
}
```

### 5.3 SalienceIssue Detection

```typescript
// File: src/evolution/salience-detector.ts
import type { Database } from 'better-sqlite3';
import type { ExecutionNoncompliance } from '../schemas';
import { ExecutionNoncomplianceRepository } from '../storage/repositories/execution-noncompliance.repo';
import { SalienceIssueRepository } from '../storage/repositories/salience-issue.repo';
import { createHash } from 'crypto';

/**
 * SalienceIssue (v1.0 schema - aligned with Phase 1)
 *
 * Tracks guidance ignored 3+ times in 30 days.
 * Signals salience problem, not guidance problem.
 */
export interface SalienceIssue {
  id: string;                                    // UUID
  guidanceLocationHash: string;                  // SHA-256(stage + location + excerpt)
  guidanceStage: 'context-pack' | 'spec';
  guidanceLocation: string;                      // Section reference
  guidanceExcerpt: string;                       // The guidance being ignored
  occurrenceCount: number;                       // How many times ignored in windowDays
  windowDays: number;                            // Default: 30
  noncomplianceIds: string[];                    // ExecutionNoncompliance IDs
  status: 'pending' | 'resolved';
  resolution?: 'reformatted' | 'moved_earlier' | 'false_positive';
  createdAt: string;                             // ISO 8601
  updatedAt: string;                             // ISO 8601
  resolvedAt?: string;                           // ISO 8601
}

export interface SalienceDetectionResult {
  detected: number;
  issues: SalienceIssue[];
}

const SALIENCE_WINDOW_DAYS = 30;
const SALIENCE_THRESHOLD = 3; // 3+ occurrences triggers SalienceIssue

/**
 * Detect SalienceIssues from ExecutionNoncompliance records.
 * v1.0: Triggered when same guidanceLocationHash is ignored 3+ times in 30 days.
 *
 * Note: SalienceIssue tracks guidance that is repeatedly IGNORED (noncompliance),
 * not patterns. This signals a formatting/prominence problem, not guidance problem.
 */
export async function detectSalienceIssues(
  db: Database
): Promise<SalienceDetectionResult> {
  const noncomplianceRepo = new ExecutionNoncomplianceRepository(db);
  const salienceRepo = new SalienceIssueRepository(db);

  const result: SalienceDetectionResult = {
    detected: 0,
    issues: []
  };

  // Calculate window boundaries
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - SALIENCE_WINDOW_DAYS);
  const windowStartStr = windowStart.toISOString();

  // Get recent noncompliance records within window
  const recentNoncompliance = noncomplianceRepo.findByDateRange(
    windowStartStr,
    now.toISOString()
  );

  // Group by guidanceLocationHash (v1.0: SHA-256 of stage|location|excerpt)
  const byLocationHash = new Map<string, typeof recentNoncompliance>();

  for (const nc of recentNoncompliance) {
    const locationHash = computeGuidanceLocationHash(nc);
    const existing = byLocationHash.get(locationHash) || [];
    existing.push(nc);
    byLocationHash.set(locationHash, existing);
  }

  // Detect issues meeting threshold (3+ in 30 days)
  for (const [locationHash, noncompliances] of byLocationHash) {
    if (noncompliances.length >= SALIENCE_THRESHOLD) {
      // Check if SalienceIssue already exists for this location
      const existing = salienceRepo.findByLocationHash(locationHash);
      if (existing && existing.status === 'pending') {
        // Update existing issue
        salienceRepo.update(existing.id, {
          noncomplianceIds: noncompliances.map(nc => nc.id),
          occurrenceCount: noncompliances.length,
          updatedAt: now.toISOString()
        });
        continue;
      }

      // Create new SalienceIssue with v1.0 schema
      const firstNc = noncompliances[0];
      const issue: SalienceIssue = {
        id: crypto.randomUUID(),
        guidanceLocationHash: locationHash,
        guidanceStage: firstNc.violatedGuidanceStage,
        guidanceLocation: firstNc.violatedGuidanceLocation,
        guidanceExcerpt: firstNc.violatedGuidanceExcerpt,
        occurrenceCount: noncompliances.length,
        windowDays: SALIENCE_WINDOW_DAYS,
        noncomplianceIds: noncompliances.map(nc => nc.id),
        status: 'pending',  // v1.0: record-only, no auto-escalation
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      salienceRepo.create(issue);
      result.detected++;
      result.issues.push(issue);

      console.log(
        `[SalienceDetector] New issue detected: ${firstNc.violatedGuidanceLocation} ` +
        `(${noncompliances.length} times ignored in ${SALIENCE_WINDOW_DAYS} days)`
      );
    }
  }

  return result;
}

/**
 * Compute guidanceLocationHash for SalienceIssue deduplication.
 * v1.0: SHA-256 of (stage + location + excerpt)
 */
function computeGuidanceLocationHash(nc: ExecutionNoncompliance): string {
  return createHash('sha256')
    .update(`${nc.violatedGuidanceStage}|${nc.violatedGuidanceLocation}|${nc.violatedGuidanceExcerpt}`)
    .digest('hex');
}
```

---

## 6. Tagging Miss Resolver

### 6.1 Implementation

```typescript
// File: src/evolution/tagging-miss-resolver.ts
import type { Database } from 'better-sqlite3';
import type { TaggingMiss, PatternDefinition } from '../schemas';
import { TaggingMissRepository } from '../storage/repositories/tagging-miss.repo';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';

export interface ResolutionSuggestion {
  taggingMiss: TaggingMiss;
  suggestions: Array<{
    action: 'broaden_pattern' | 'improve_extraction' | 'false_positive';
    description: string;
    changes?: Partial<PatternDefinition>;
  }>;
}

/**
 * Analyze tagging misses and suggest resolutions.
 */
export function analyzeTaggingMisses(
  db: Database
): ResolutionSuggestion[] {
  const taggingMissRepo = new TaggingMissRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  const pendingMisses = taggingMissRepo.findByStatus('pending');
  const suggestions: ResolutionSuggestion[] = [];

  // Group by pattern to find recurring issues
  const byPattern = new Map<string, TaggingMiss[]>();
  for (const miss of pendingMisses) {
    const existing = byPattern.get(miss.patternId) || [];
    existing.push(miss);
    byPattern.set(miss.patternId, existing);
  }

  for (const [patternId, misses] of byPattern) {
    const pattern = patternRepo.findById(patternId);
    if (!pattern) continue;

    const suggestionList: ResolutionSuggestion['suggestions'] = [];

    // Analyze missing tags across all misses
    const allMissingTags = misses.flatMap(m => m.missingTags);
    const tagCounts = countOccurrences(allMissingTags);

    // Find commonly missing tags
    const frequentMissing = Object.entries(tagCounts)
      .filter(([_, count]) => count >= Math.ceil(misses.length * 0.5))
      .map(([tag]) => tag);

    if (frequentMissing.length > 0) {
      // Suggest broadening pattern
      const newTouches = [...pattern.touches];
      const newTechs = [...pattern.technologies];
      const newTypes = [...pattern.taskTypes];

      for (const tag of frequentMissing) {
        if (tag.startsWith('touch:')) {
          const touch = tag.replace('touch:', '');
          if (!newTouches.includes(touch as any)) {
            newTouches.push(touch as any);
          }
        } else if (tag.startsWith('tech:')) {
          const tech = tag.replace('tech:', '');
          if (!newTechs.includes(tech)) {
            newTechs.push(tech);
          }
        } else if (tag.startsWith('type:')) {
          const type = tag.replace('type:', '');
          if (!newTypes.includes(type)) {
            newTypes.push(type);
          }
        }
      }

      suggestionList.push({
        action: 'broaden_pattern',
        description: `Add missing tags to pattern: ${frequentMissing.join(', ')}`,
        changes: {
          touches: newTouches,
          technologies: newTechs,
          taskTypes: newTypes
        }
      });
    }

    // If single occurrence, might be false positive or extraction issue
    if (misses.length === 1) {
      suggestionList.push({
        action: 'false_positive',
        description: 'Single occurrence - may be a false positive or one-off edge case'
      });

      suggestionList.push({
        action: 'improve_extraction',
        description: 'TaskProfile extraction may have missed relevant signals from issue text'
      });
    }

    suggestions.push({
      taggingMiss: misses[0], // Representative miss
      suggestions: suggestionList
    });
  }

  return suggestions;
}

/**
 * Apply a resolution to a tagging miss.
 */
export function resolveTaggingMiss(
  db: Database,
  taggingMissId: string,
  resolution: 'broadened_pattern' | 'improved_extraction' | 'false_positive',
  patternChanges?: Partial<PatternDefinition>
): void {
  const taggingMissRepo = new TaggingMissRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  const miss = taggingMissRepo.findById(taggingMissId);
  if (!miss) return;

  // Apply pattern changes if broadening
  if (resolution === 'broadened_pattern' && patternChanges) {
    patternRepo.update(miss.patternId, patternChanges);
  }

  // Mark as resolved
  taggingMissRepo.update(taggingMissId, {
    status: 'resolved',
    resolution,
    resolvedAt: new Date().toISOString()
  });
}

function countOccurrences(arr: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return counts;
}
```

---

## 7. Metrics Collection

### 7.1 Implementation

```typescript
// File: src/metrics/collector.ts
import type { Database } from 'better-sqlite3';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo';
import { ExecutionNoncomplianceRepository } from '../storage/repositories/execution-noncompliance.repo';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';
import { TaggingMissRepository } from '../storage/repositories/tagging-miss.repo';

export interface SystemMetrics {
  // Pattern metrics
  patterns: {
    total: number;
    active: number;
    archived: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    byFailureMode: Record<string, number>;
  };

  // Occurrence metrics
  occurrences: {
    total: number;
    active: number;
    inactive: number;
    avgPerPattern: number;
  };

  // Principle metrics
  principles: {
    total: number;
    baseline: number;
    derived: number;
  };

  // Effectiveness metrics
  effectiveness: {
    totalInjections: number;
    adherenceRate: number | null;
    noncomplianceCount: number;
    taggingMisses: {
      pending: number;
      resolved: number;
    };
  };

  // Time-based metrics
  timeSeries: {
    patternsCreatedLast30Days: number;
    findingsAttributedLast30Days: number;
  };
}

/**
 * Collect system-wide metrics.
 */
export function collectMetrics(db: Database): SystemMetrics {
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const principleRepo = new DerivedPrincipleRepository(db);
  const noncomplianceRepo = new ExecutionNoncomplianceRepository(db);
  const injectionLogRepo = new InjectionLogRepository(db);
  const taggingMissRepo = new TaggingMissRepository(db);

  // Pattern metrics
  const allPatterns = patternRepo.findAll();
  const activePatterns = allPatterns.filter(p => p.status === 'active');
  const archivedPatterns = allPatterns.filter(p => p.status === 'archived');

  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byFailureMode: Record<string, number> = {};

  for (const pattern of allPatterns) {
    byCategory[pattern.findingCategory] = (byCategory[pattern.findingCategory] || 0) + 1;
    bySeverity[pattern.severity] = (bySeverity[pattern.severity] || 0) + 1;
    byFailureMode[pattern.failureMode] = (byFailureMode[pattern.failureMode] || 0) + 1;
  }

  // Occurrence metrics
  const allOccurrences = occurrenceRepo.findAll();
  const activeOccurrences = allOccurrences.filter(o => o.status === 'active');
  const inactiveOccurrences = allOccurrences.filter(o => o.status === 'inactive');

  // Principle metrics
  const allPrinciples = principleRepo.findAll();
  const baselinePrinciples = allPrinciples.filter(p => p.origin === 'baseline');
  const derivedPrinciples = allPrinciples.filter(p => p.origin === 'derived');

  // Effectiveness metrics
  const injectionLogs = injectionLogRepo.findAll();
  const injectedOccurrences = allOccurrences.filter(o => o.wasInjected);
  const adheredOccurrences = injectedOccurrences.filter(o => o.wasAdheredTo === true);
  const adherenceRate = injectedOccurrences.length > 0
    ? adheredOccurrences.length / injectedOccurrences.length
    : null;

  const noncompliances = noncomplianceRepo.findAll();
  const pendingMisses = taggingMissRepo.findByStatus('pending');
  const resolvedMisses = taggingMissRepo.findByStatus('resolved');

  // Time-based metrics
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

  const patternsCreatedLast30Days = allPatterns.filter(
    p => p.createdAt >= thirtyDaysAgoStr
  ).length;
  const findingsAttributedLast30Days = allOccurrences.filter(
    o => o.createdAt >= thirtyDaysAgoStr
  ).length;

  return {
    patterns: {
      total: allPatterns.length,
      active: activePatterns.length,
      archived: archivedPatterns.length,
      byCategory,
      bySeverity,
      byFailureMode
    },
    occurrences: {
      total: allOccurrences.length,
      active: activeOccurrences.length,
      inactive: inactiveOccurrences.length,
      avgPerPattern: allPatterns.length > 0
        ? allOccurrences.length / allPatterns.length
        : 0
    },
    principles: {
      total: allPrinciples.length,
      baseline: baselinePrinciples.length,
      derived: derivedPrinciples.length
    },
    effectiveness: {
      totalInjections: injectionLogs.length,
      adherenceRate,
      noncomplianceCount: noncompliances.length,
      taggingMisses: {
        pending: pendingMisses.length,
        resolved: resolvedMisses.length
      }
    },
    timeSeries: {
      patternsCreatedLast30Days,
      findingsAttributedLast30Days
    }
  };
}
```

### 7.2 Metrics Reporter

```typescript
// File: src/metrics/reporter.ts
import type { SystemMetrics } from './collector';

/**
 * Format metrics as markdown report.
 */
export function formatMetricsReport(metrics: SystemMetrics): string {
  const lines: string[] = [
    '# Pattern Attribution System Metrics',
    '',
    `_Generated: ${new Date().toISOString()}_`,
    '',
    '## Patterns',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total | ${metrics.patterns.total} |`,
    `| Active | ${metrics.patterns.active} |`,
    `| Archived | ${metrics.patterns.archived} |`,
    '',
    '### By Category',
    '',
    `| Category | Count |`,
    `|----------|-------|`,
    ...Object.entries(metrics.patterns.byCategory)
      .map(([cat, count]) => `| ${cat} | ${count} |`),
    '',
    '### By Severity',
    '',
    `| Severity | Count |`,
    `|----------|-------|`,
    ...Object.entries(metrics.patterns.bySeverity)
      .map(([sev, count]) => `| ${sev} | ${count} |`),
    '',
    '### By Failure Mode',
    '',
    `| Mode | Count |`,
    `|------|-------|`,
    ...Object.entries(metrics.patterns.byFailureMode)
      .map(([mode, count]) => `| ${mode} | ${count} |`),
    '',
    '## Occurrences',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total | ${metrics.occurrences.total} |`,
    `| Active | ${metrics.occurrences.active} |`,
    `| Inactive | ${metrics.occurrences.inactive} |`,
    `| Avg per Pattern | ${metrics.occurrences.avgPerPattern.toFixed(2)} |`,
    '',
    '## Principles',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total | ${metrics.principles.total} |`,
    `| Baseline | ${metrics.principles.baseline} |`,
    `| Derived | ${metrics.principles.derived} |`,
    '',
    '## Effectiveness',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Injections | ${metrics.effectiveness.totalInjections} |`,
    `| Adherence Rate | ${metrics.effectiveness.adherenceRate !== null
      ? `${(metrics.effectiveness.adherenceRate * 100).toFixed(1)}%`
      : 'N/A'} |`,
    `| Noncompliances | ${metrics.effectiveness.noncomplianceCount} |`,
    `| Tagging Misses (Pending) | ${metrics.effectiveness.taggingMisses.pending} |`,
    `| Tagging Misses (Resolved) | ${metrics.effectiveness.taggingMisses.resolved} |`,
    '',
    '## Last 30 Days',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| New Patterns | ${metrics.timeSeries.patternsCreatedLast30Days} |`,
    `| Findings Attributed | ${metrics.timeSeries.findingsAttributedLast30Days} |`,
  ];

  return lines.join('\n');
}

/**
 * Format compact summary for logging.
 */
export function formatMetricsSummary(metrics: SystemMetrics): string {
  const adherenceStr = metrics.effectiveness.adherenceRate !== null
    ? `${(metrics.effectiveness.adherenceRate * 100).toFixed(0)}%`
    : 'N/A';

  return [
    `Patterns: ${metrics.patterns.active}/${metrics.patterns.total} active`,
    `Occurrences: ${metrics.occurrences.active} active`,
    `Adherence: ${adherenceStr}`,
    `Tagging Misses: ${metrics.effectiveness.taggingMisses.pending} pending`
  ].join(' | ');
}
```

---

## 8. Scheduled Jobs

### 8.1 Job Runner

```typescript
// File: src/evolution/scheduler.ts
import type { Database } from 'better-sqlite3';
import { processConfidenceDecay } from './decay-processor';
import { processProvisionalAlertExpiry } from './provisional-alert-processor'; // v1.0
import { detectSalienceIssues } from './salience-detector'; // v1.0
import { collectMetrics } from '../metrics/collector';
import { formatMetricsReport, formatMetricsSummary } from '../metrics/reporter';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const METRICS_DIR = path.join(os.homedir(), '.claude', 'meta', 'metrics');

/**
 * Run daily maintenance jobs.
 */
export async function runDailyMaintenance(db: Database): Promise<void> {
  console.log('[Maintenance] Starting daily maintenance...');

  // 1. Process confidence decay
  console.log('[Maintenance] Processing confidence decay...');
  const decayResult = await processConfidenceDecay(db);
  console.log(`[Maintenance] Decay: ${decayResult.processed} processed, ${decayResult.archived} archived`);

  // 2. v1.0: Process ProvisionalAlert expiry
  console.log('[Maintenance] Processing ProvisionalAlert expiry...');
  const expiryResult = await processProvisionalAlertExpiry(db);
  console.log(`[Maintenance] Alerts: ${expiryResult.expired} expired, ${expiryResult.promoted} promoted`);

  // 3. v1.0: Detect SalienceIssues (3+ occurrences in 30 days)
  console.log('[Maintenance] Detecting SalienceIssues...');
  const salienceResult = await detectSalienceIssues(db);
  console.log(`[Maintenance] SalienceIssues: ${salienceResult.detected} new issues detected`);

  // 4. Collect and save metrics
  console.log('[Maintenance] Collecting metrics...');
  const metrics = collectMetrics(db);
  console.log(`[Maintenance] ${formatMetricsSummary(metrics)}`);

  // 5. Save metrics report
  await fs.mkdir(METRICS_DIR, { recursive: true });
  const reportPath = path.join(METRICS_DIR, `report-${new Date().toISOString().split('T')[0]}.md`);
  await fs.writeFile(reportPath, formatMetricsReport(metrics));
  console.log(`[Maintenance] Metrics saved to ${reportPath}`);

  // 6. Save latest metrics JSON
  const latestPath = path.join(METRICS_DIR, 'latest.json');
  await fs.writeFile(latestPath, JSON.stringify(metrics, null, 2));

  console.log('[Maintenance] Daily maintenance complete');
}

/**
 * Run on document change (triggered by git hook or watcher).
 * v1.0: Updated to use fingerprint-based document matching.
 */
export async function runOnDocChange(
  db: Database,
  changes: Array<{
    fingerprint: DocFingerprint;
    content: string;
    excerptHashes?: Map<string, string>;
  }>
): Promise<void> {
  const { onDocumentChange, computeExcerptHash } = await import('./doc-change-watcher');

  for (const change of changes) {
    // v1.0: Use fingerprint for logging
    const docId = change.fingerprint.kind === 'git'
      ? `${change.fingerprint.repo}:${change.fingerprint.path}`
      : change.fingerprint.kind === 'linear'
      ? change.fingerprint.docId
      : change.fingerprint.kind === 'web'
      ? change.fingerprint.url
      : change.fingerprint.id;

    console.log(`[DocChange] Processing ${change.fingerprint.kind} doc: ${docId}...`);

    const result = await onDocumentChange(db, {
      fingerprint: change.fingerprint,
      newContent: change.content,
      excerptHashes: change.excerptHashes
    });

    if (result.invalidatedOccurrences > 0) {
      console.log(`[DocChange] Invalidated ${result.invalidatedOccurrences} occurrences`);
    }
    if (result.archivedPatterns.length > 0) {
      console.log(`[DocChange] Archived ${result.archivedPatterns.length} patterns`);
    }
  }
}
```

---

## 9. Acceptance Criteria

Phase 5 is complete when:

1. [ ] Document changes trigger occurrence invalidation (v1.0: fingerprint-based matching)
2. [ ] Confidence decay runs and archives stale patterns
3. [ ] Tagging miss analysis provides actionable suggestions
4. [ ] Metrics collection captures all key data
5. [ ] Daily maintenance job runs successfully
6. [ ] Metrics report generated and saved
7. [ ] v1.0: ProvisionalAlert expiry processing works correctly
8. [ ] v1.0: SalienceIssue detection identifies 3+ occurrences in 30 days
9. [ ] v1.0: ProvisionalAlert promotion creates patterns on recurrence

---

## 10. System Complete

With Phase 5 complete, the full Pattern Attribution System is operational:

1. **Injection:** Warnings injected into Context Pack and Spec agents
2. **Attribution:** PR review findings traced to source guidance
3. **Learning:** Patterns created and confidence tracked
4. **Evolution:** Decay, invalidation, and miss resolution
5. **Monitoring:** Metrics and reporting

### Post-Implementation Monitoring

Key metrics to track:
- Adherence rate trend (should increase over time)
- Tagging miss rate (should decrease)
- Pattern quality (occurrence count, confidence distribution)
- System load (injection latency, attribution time)

### Future Enhancements (v2)

- Semantic clustering for near-duplicate detection
- Automatic DerivedPrinciple generation
- Conflict graph visualization
- A/B testing for injection strategies
- Human review UI
