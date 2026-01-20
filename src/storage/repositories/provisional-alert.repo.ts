/**
 * Provisional Alert repository.
 *
 * Manages short-lived alerts for CRITICAL findings that don't meet pattern gate.
 */

import { randomUUID } from 'crypto';
import type { ProvisionalAlert, Touch } from '../../schemas/index.js';
import { ProvisionalAlertSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<ProvisionalAlert, 'id' | 'createdAt'>;

export class ProvisionalAlertRepository extends BaseRepository<ProvisionalAlert> {
  /**
   * Find an alert by ID.
   */
  findById(id: string): ProvisionalAlert | null {
    const row = this.db
      .prepare('SELECT * FROM provisional_alerts WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find active alerts in a project.
   */
  findActive(options: {
    workspaceId: string;
    projectId: string;
    injectInto?: 'context-pack' | 'spec' | 'both';
    touches?: Touch[];
  }): ProvisionalAlert[] {
    const now = this.now();
    let sql = `
      SELECT * FROM provisional_alerts
      WHERE workspace_id = ? AND project_id = ?
        AND status = ? AND expires_at > ?
    `;
    const params: unknown[] = [
      options.workspaceId,
      options.projectId,
      'active',
      now,
    ];

    if (options.injectInto) {
      sql += ' AND (inject_into = ? OR inject_into = ?)';
      params.push(options.injectInto, 'both');
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    let alerts = rows.map((row) => this.rowToEntity(row));

    // Filter by touches if provided
    if (options.touches) {
      alerts = alerts.filter((a) =>
        a.touches.some((t) => options.touches!.includes(t))
      );
    }

    return alerts;
  }

  /**
   * Find expired alerts (for cleanup job).
   */
  findExpired(): ProvisionalAlert[] {
    const now = this.now();
    const rows = this.db
      .prepare(
        "SELECT * FROM provisional_alerts WHERE status = 'active' AND expires_at <= ?"
      )
      .all(now) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find alerts by finding ID.
   */
  findByFindingId(options: {
    workspaceId: string;
    projectId: string;
    findingId: string;
  }): ProvisionalAlert[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM provisional_alerts
      WHERE workspace_id = ? AND project_id = ? AND finding_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId, options.findingId) as Record<
        string,
        unknown
      >[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find all alerts in a project.
   */
  findByProject(options: {
    workspaceId: string;
    projectId: string;
  }): ProvisionalAlert[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM provisional_alerts
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Create a new alert.
   */
  create(data: CreateInput): ProvisionalAlert {
    const now = this.now();

    const alert: ProvisionalAlert = {
      id: randomUUID(),
      createdAt: now,
      ...data,
    };

    ProvisionalAlertSchema.parse(alert);

    this.db
      .prepare(
        `
      INSERT INTO provisional_alerts (
        id, workspace_id, project_id, finding_id, issue_id, message,
        touches, inject_into, expires_at, status, promoted_to_pattern_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        alert.id,
        alert.workspaceId,
        alert.projectId,
        alert.findingId,
        alert.issueId,
        alert.message,
        this.stringifyJsonField(alert.touches),
        alert.injectInto,
        alert.expiresAt,
        alert.status,
        alert.promotedToPatternId ?? null,
        alert.createdAt
      );

    return alert;
  }

  /**
   * Update an alert.
   */
  update(id: string, data: Partial<ProvisionalAlert>): ProvisionalAlert | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: ProvisionalAlert = {
      ...existing,
      ...data,
      id: existing.id,
      workspaceId: existing.workspaceId, // Immutable
      projectId: existing.projectId, // Immutable
      createdAt: existing.createdAt,
    };

    ProvisionalAlertSchema.parse(updated);

    this.db
      .prepare(
        `
      UPDATE provisional_alerts SET
        message = ?, touches = ?, inject_into = ?,
        expires_at = ?, status = ?, promoted_to_pattern_id = ?
      WHERE id = ?
    `
      )
      .run(
        updated.message,
        this.stringifyJsonField(updated.touches),
        updated.injectInto,
        updated.expiresAt,
        updated.status,
        updated.promotedToPatternId ?? null,
        id
      );

    return updated;
  }

  /**
   * Update status with optional promoted pattern ID.
   */
  updateStatus(options: {
    workspaceId: string;
    id: string;
    status: 'active' | 'expired' | 'promoted';
    promotedPatternId?: string;
  }): boolean {
    const result = this.db
      .prepare(
        `
      UPDATE provisional_alerts
      SET status = ?, promoted_to_pattern_id = ?
      WHERE id = ? AND workspace_id = ?
    `
      )
      .run(
        options.status,
        options.promotedPatternId ?? null,
        options.id,
        options.workspaceId
      );

    return result.changes > 0;
  }

  /**
   * Mark an alert as expired.
   */
  expire(id: string): boolean {
    const result = this.db
      .prepare("UPDATE provisional_alerts SET status = 'expired' WHERE id = ?")
      .run(id);

    return result.changes > 0;
  }

  /**
   * Promote an alert to a pattern.
   */
  promote(id: string, patternId: string): boolean {
    const result = this.db
      .prepare(
        `
      UPDATE provisional_alerts
      SET status = 'promoted', promoted_to_pattern_id = ?
      WHERE id = ?
    `
      )
      .run(patternId, id);

    return result.changes > 0;
  }

  /**
   * Convert a database row to a ProvisionalAlert entity.
   */
  private rowToEntity(row: Record<string, unknown>): ProvisionalAlert {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      findingId: row.finding_id as string,
      issueId: row.issue_id as string,
      message: row.message as string,
      touches: this.parseJsonField<Touch[]>(row.touches as string),
      injectInto: row.inject_into as ProvisionalAlert['injectInto'],
      expiresAt: row.expires_at as string,
      status: row.status as ProvisionalAlert['status'],
      promotedToPatternId: (row.promoted_to_pattern_id as string) || undefined,
      createdAt: row.created_at as string,
    };
  }
}
