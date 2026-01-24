/**
 * Pattern Occurrence repository.
 *
 * Manages specific instances of pattern attribution (append-only).
 * Includes document fingerprint queries for Phase 5 change detection.
 */

import { randomUUID } from 'crypto';
import type {
  PatternOccurrence,
  EvidenceBundle,
  DocFingerprint,
} from '../../schemas/index.js';
import { PatternOccurrenceSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<PatternOccurrence, 'id' | 'createdAt'>;

export class PatternOccurrenceRepository extends BaseRepository<PatternOccurrence> {
  /**
   * Find an occurrence by ID.
   */
  findById(id: string): PatternOccurrence | null {
    const row = this.db
      .prepare('SELECT * FROM pattern_occurrences WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find occurrences by pattern within scope.
   */
  findByPatternId(options: {
    workspaceId: string;
    patternId: string;
  }): PatternOccurrence[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND pattern_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.patternId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find occurrences linked to a ProvisionalAlert (for promotion tracking).
   */
  findByProvisionalAlertId(options: {
    workspaceId: string;
    alertId: string;
  }): PatternOccurrence[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND provisional_alert_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.alertId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find occurrence by pattern + issue (for adherence updater).
   */
  findByPatternAndIssue(options: {
    workspaceId: string;
    projectId: string;
    patternId: string;
    issueId: string;
  }): PatternOccurrence | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND project_id = ? AND pattern_id = ? AND issue_id = ?
      LIMIT 1
    `
      )
      .get(
        options.workspaceId,
        options.projectId,
        options.patternId,
        options.issueId
      ) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find active occurrences within scope.
   */
  findActive(options: {
    workspaceId: string;
    projectId: string;
  }): PatternOccurrence[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND project_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find occurrences by issue.
   */
  findByIssueId(options: {
    workspaceId: string;
    projectId: string;
    issueId: string;
  }): PatternOccurrence[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND project_id = ? AND issue_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId, options.issueId) as Record<
        string,
        unknown
      >[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Create a new occurrence.
   */
  create(data: CreateInput): PatternOccurrence {
    const now = this.now();

    const occurrence: PatternOccurrence = {
      id: randomUUID(),
      createdAt: now,
      ...data,
    };

    PatternOccurrenceSchema.parse(occurrence);

    this.db
      .prepare(
        `
      INSERT INTO pattern_occurrences (
        id, workspace_id, project_id, pattern_id, finding_id, issue_id,
        pr_number, severity, evidence, carrier_fingerprint, origin_fingerprint,
        provenance_chain, carrier_excerpt_hash, origin_excerpt_hash,
        was_injected, was_adhered_to, status, inactive_reason, provisional_alert_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        occurrence.id,
        occurrence.workspaceId,
        occurrence.projectId,
        occurrence.patternId,
        occurrence.findingId,
        occurrence.issueId,
        occurrence.prNumber,
        occurrence.severity,
        this.stringifyJsonField(occurrence.evidence),
        this.stringifyJsonField(occurrence.carrierFingerprint),
        occurrence.originFingerprint
          ? this.stringifyJsonField(occurrence.originFingerprint)
          : null,
        this.stringifyJsonField(occurrence.provenanceChain),
        occurrence.carrierExcerptHash,
        occurrence.originExcerptHash ?? null,
        this.boolToInt(occurrence.wasInjected),
        occurrence.wasAdheredTo === null
          ? null
          : this.boolToInt(occurrence.wasAdheredTo),
        occurrence.status,
        occurrence.inactiveReason ?? null,
        occurrence.provisionalAlertId ?? null,
        occurrence.createdAt
      );

    return occurrence;
  }

  /**
   * Update an occurrence (for adherence tracking and promotion).
   */
  update(options: {
    workspaceId: string;
    id: string;
    patternId?: string;
    provisionalAlertId?: string | null;
    wasInjected?: boolean;
    wasAdheredTo?: boolean | null;
    status?: 'active' | 'inactive';
    inactiveReason?: string | null;
  }): PatternOccurrence | null {
    const existing = this.findById(options.id);
    if (!existing || existing.workspaceId !== options.workspaceId) return null;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (options.patternId !== undefined) {
      updates.push('pattern_id = ?');
      params.push(options.patternId);
    }
    if (options.wasInjected !== undefined) {
      updates.push('was_injected = ?');
      params.push(this.boolToInt(options.wasInjected));
    }
    if (options.wasAdheredTo !== undefined) {
      updates.push('was_adhered_to = ?');
      params.push(
        options.wasAdheredTo === null ? null : this.boolToInt(options.wasAdheredTo)
      );
    }
    if (options.status !== undefined) {
      updates.push('status = ?');
      params.push(options.status);
    }
    if (options.inactiveReason !== undefined) {
      updates.push('inactive_reason = ?');
      params.push(options.inactiveReason);
    }

    if (updates.length === 0) return existing;

    params.push(options.id);

    this.db.prepare(`UPDATE pattern_occurrences SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    return this.findById(options.id);
  }

  // ============================================
  // PHASE 5: Document change detection methods
  // ============================================

  /**
   * Find occurrences citing a git document (by repo + path).
   * Used by Phase 5 doc-change-watcher to invalidate occurrences.
   */
  findByGitDoc(options: {
    workspaceId: string;
    repo: string;
    path: string;
    status?: 'active' | 'inactive';
  }): PatternOccurrence[] {
    const statusFilter = options.status || 'active';
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ?
        AND status = ?
        AND (
          (json_extract(carrier_fingerprint, '$.kind') = 'git'
           AND json_extract(carrier_fingerprint, '$.repo') = ?
           AND json_extract(carrier_fingerprint, '$.path') = ?)
          OR
          (json_extract(origin_fingerprint, '$.kind') = 'git'
           AND json_extract(origin_fingerprint, '$.repo') = ?
           AND json_extract(origin_fingerprint, '$.path') = ?)
        )
    `
      )
      .all(
        options.workspaceId,
        statusFilter,
        options.repo,
        options.path,
        options.repo,
        options.path
      ) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find occurrences citing a Linear document (by docId).
   */
  findByLinearDocId(options: {
    workspaceId: string;
    docId: string;
    status?: 'active' | 'inactive';
  }): PatternOccurrence[] {
    const statusFilter = options.status || 'active';
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ?
        AND status = ?
        AND (
          (json_extract(carrier_fingerprint, '$.kind') = 'linear'
           AND json_extract(carrier_fingerprint, '$.docId') = ?)
          OR
          (json_extract(origin_fingerprint, '$.kind') = 'linear'
           AND json_extract(origin_fingerprint, '$.docId') = ?)
        )
    `
      )
      .all(options.workspaceId, statusFilter, options.docId, options.docId) as Record<
        string,
        unknown
      >[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find occurrences citing a web URL.
   */
  findByWebUrl(options: {
    workspaceId: string;
    url: string;
    status?: 'active' | 'inactive';
  }): PatternOccurrence[] {
    const statusFilter = options.status || 'active';
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ?
        AND status = ?
        AND (
          (json_extract(carrier_fingerprint, '$.kind') = 'web'
           AND json_extract(carrier_fingerprint, '$.url') = ?)
          OR
          (json_extract(origin_fingerprint, '$.kind') = 'web'
           AND json_extract(origin_fingerprint, '$.url') = ?)
        )
    `
      )
      .all(options.workspaceId, statusFilter, options.url, options.url) as Record<
        string,
        unknown
      >[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find occurrences citing an external reference (CWE, OWASP, etc.).
   */
  findByExternalId(options: {
    workspaceId: string;
    externalId: string;
    status?: 'active' | 'inactive';
  }): PatternOccurrence[] {
    const statusFilter = options.status || 'active';
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ?
        AND status = ?
        AND (
          (json_extract(carrier_fingerprint, '$.kind') = 'external'
           AND json_extract(carrier_fingerprint, '$.id') = ?)
          OR
          (json_extract(origin_fingerprint, '$.kind') = 'external'
           AND json_extract(origin_fingerprint, '$.id') = ?)
        )
    `
      )
      .all(
        options.workspaceId,
        statusFilter,
        options.externalId,
        options.externalId
      ) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Convert a database row to a PatternOccurrence entity.
   */
  private rowToEntity(row: Record<string, unknown>): PatternOccurrence {
    return {
      id: row.id as string,
      patternId: row.pattern_id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      findingId: row.finding_id as string,
      issueId: row.issue_id as string,
      prNumber: row.pr_number as number,
      severity: row.severity as PatternOccurrence['severity'],
      evidence: this.parseJsonField<EvidenceBundle>(row.evidence as string),
      carrierFingerprint: this.parseJsonField<DocFingerprint>(
        row.carrier_fingerprint as string
      ),
      originFingerprint: row.origin_fingerprint
        ? this.parseJsonField<DocFingerprint>(row.origin_fingerprint as string)
        : undefined,
      provenanceChain: this.parseJsonField<DocFingerprint[]>(
        row.provenance_chain as string
      ),
      carrierExcerptHash: row.carrier_excerpt_hash as string,
      originExcerptHash: (row.origin_excerpt_hash as string) || undefined,
      wasInjected: this.intToBool(row.was_injected as number),
      wasAdheredTo: this.nullableIntToBool(row.was_adhered_to as number | null),
      status: row.status as PatternOccurrence['status'],
      inactiveReason:
        (row.inactive_reason as PatternOccurrence['inactiveReason']) || undefined,
      provisionalAlertId: (row.provisional_alert_id as string) || undefined,
      createdAt: row.created_at as string,
    };
  }
}
