/**
 * Baseline principle seeding.
 *
 * Seeds the 11 baseline principles (B01-B11) when a workspace is created.
 * These provide foundational guardrails for the injection system.
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';

interface BaselinePrinciple {
  principle: string;
  rationale: string;
  touches: string[];
  externalRefs?: string[];
}

const BASELINE_PRINCIPLES: BaselinePrinciple[] = [
  {
    principle:
      'Always use parameterized queries for SQL. Never interpolate user input into query strings.',
    rationale: 'Prevents SQL injection, the most common and dangerous database vulnerability.',
    touches: ['database', 'user_input'],
    externalRefs: ['CWE-89'],
  },
  {
    principle:
      'Validate, sanitize, and bound all external input before processing. Reject unexpected types, formats, and sizes.',
    rationale: 'Prevents injection attacks, type confusion, and DoS via malformed input.',
    touches: ['user_input'],
    externalRefs: ['CWE-20'],
  },
  {
    principle: 'Never log secrets, credentials, API keys, or PII. Redact or omit sensitive fields.',
    rationale: 'Prevents credential leakage through log aggregation and monitoring systems.',
    touches: ['logging', 'auth'],
    externalRefs: ['CWE-532'],
  },
  {
    principle:
      'Require explicit authorization checks before sensitive operations. Never rely on implicit permissions.',
    rationale: 'Prevents privilege escalation and unauthorized access to protected resources.',
    touches: ['auth', 'authz'],
    externalRefs: ['CWE-862'],
  },
  {
    principle: 'Set timeouts on all network calls. No unbounded waits.',
    rationale:
      'Prevents resource exhaustion and cascading failures from slow/unresponsive services.',
    touches: ['network'],
  },
  {
    principle: 'Implement retry with exponential backoff, jitter, and maximum attempt limits.',
    rationale: 'Prevents retry storms and allows graceful degradation during outages.',
    touches: ['network'],
  },
  {
    principle: 'Use idempotency keys for operations that cannot be safely retried.',
    rationale: 'Prevents duplicate processing and data corruption during network retries.',
    touches: ['network', 'database'],
  },
  {
    principle: 'Enforce size limits and rate limits on user-provided data and requests.',
    rationale: 'Prevents DoS attacks and resource exhaustion from malicious or buggy clients.',
    touches: ['user_input', 'api'],
    externalRefs: ['CWE-400'],
  },
  {
    principle: 'Require migration plan with rollback strategy for all schema changes.',
    rationale: 'Prevents data loss and enables recovery from failed deployments.',
    touches: ['schema'],
  },
  {
    principle:
      'Define error contract (status codes, error shapes, error codes) before implementation.',
    rationale: 'Ensures consistent error handling across the system and clear client expectations.',
    touches: ['api'],
  },
  {
    principle:
      "Use least-privilege credentials for DB/service access. Don't run migrations/ops with app runtime creds. Scope tokens tightly.",
    rationale: 'Reduces blast radius of credential compromise and limits damage from bugs.',
    touches: ['database', 'auth', 'config'],
    externalRefs: ['CWE-250'],
  },
];

/**
 * Seed baseline principles for a workspace.
 * Idempotent: skips already-existing baselines.
 *
 * @param db - Database connection
 * @param workspaceId - Workspace ID to seed baselines for
 * @returns Number of baselines created (0 if all already exist)
 */
export function seedBaselines(db: Database.Database, workspaceId: string): number {
  const now = new Date().toISOString();
  let seeded = 0;

  const insertStmt = db.prepare(`
    INSERT INTO derived_principles (
      id, workspace_id, principle, rationale, origin, external_refs,
      inject_into, touches, confidence, status, permanent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const checkStmt = db.prepare(`
    SELECT id FROM derived_principles
    WHERE workspace_id = ? AND principle = ? AND origin = 'baseline'
  `);

  for (const baseline of BASELINE_PRINCIPLES) {
    // Check if already exists
    const existing = checkStmt.get(workspaceId, baseline.principle) as { id: string } | undefined;
    if (existing) continue;

    insertStmt.run(
      randomUUID(),
      workspaceId,
      baseline.principle,
      baseline.rationale,
      'baseline',
      baseline.externalRefs ? JSON.stringify(baseline.externalRefs) : null,
      'both',
      JSON.stringify(baseline.touches),
      0.9, // High confidence for baselines
      'active',
      1, // permanent = true
      now,
      now
    );
    seeded++;
  }

  return seeded;
}

/**
 * Check if baselines are seeded for a workspace.
 *
 * @param db - Database connection
 * @param workspaceId - Workspace ID to check
 * @returns Object with seeded count and expected count
 */
export function checkBaselinesSeeded(
  db: Database.Database,
  workspaceId: string
): { seeded: number; expected: number } {
  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM derived_principles
    WHERE workspace_id = ? AND origin = 'baseline' AND status = 'active'
  `
    )
    .get(workspaceId) as { count: number };

  return {
    seeded: result.count,
    expected: BASELINE_PRINCIPLES.length,
  };
}

/**
 * Get the expected number of baseline principles.
 */
export function getBaselineCount(): number {
  return BASELINE_PRINCIPLES.length;
}
