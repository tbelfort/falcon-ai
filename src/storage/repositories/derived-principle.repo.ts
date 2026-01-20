/**
 * Derived Principle repository.
 *
 * Manages baseline guardrails and derived principles with:
 * - Workspace-scoped access
 * - Promotion tracking for idempotent promotion
 * - Rollback support
 */

import { randomUUID, createHash } from 'crypto';
import type { DerivedPrinciple, Touch } from '../../schemas/index.js';
import { DerivedPrincipleSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<DerivedPrinciple, 'id' | 'createdAt' | 'updatedAt'>;

export class DerivedPrincipleRepository extends BaseRepository<DerivedPrinciple> {
  /**
   * Find a principle by ID.
   */
  findById(id: string): DerivedPrinciple | null {
    const row = this.db
      .prepare('SELECT * FROM derived_principles WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find by principle text (for baseline deduplication).
   */
  findByPrinciple(principle: string, workspaceId: string): DerivedPrinciple | null {
    const row = this.db
      .prepare(
        'SELECT * FROM derived_principles WHERE principle = ? AND workspace_id = ?'
      )
      .get(principle, workspaceId) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all active principles (baselines and derived) - workspace-scoped.
   */
  findActive(options: {
    workspaceId: string;
    origin?: 'baseline' | 'derived';
  }): DerivedPrinciple[] {
    let sql = `
      SELECT * FROM derived_principles
      WHERE workspace_id = ? AND status = 'active'
    `;
    const params: unknown[] = [options.workspaceId];

    if (options.origin) {
      sql += ' AND origin = ?';
      params.push(options.origin);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find baselines only.
   */
  findBaselines(workspaceId: string): DerivedPrinciple[] {
    return this.findActive({ workspaceId, origin: 'baseline' });
  }

  /**
   * Find derived principles only.
   */
  findDerived(workspaceId: string): DerivedPrinciple[] {
    return this.findActive({ workspaceId, origin: 'derived' });
  }

  /**
   * Find active principles for injection with touch filtering.
   */
  findForInjection(options: {
    workspaceId: string;
    target: 'context-pack' | 'spec';
    touches: string[];
  }): DerivedPrinciple[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM derived_principles
      WHERE workspace_id = ?
        AND status = 'active'
        AND (inject_into = ? OR inject_into = 'both')
    `
      )
      .all(options.workspaceId, options.target) as Record<string, unknown>[];

    // Filter by touches overlap in application code
    return rows.map((row) => this.rowToEntity(row)).filter((dp) => {
      if (dp.touches.length === 0) return true; // No filter = applies everywhere
      return dp.touches.some((t) => options.touches.includes(t));
    });
  }

  /**
   * Find by promotion key for idempotent promotion.
   */
  findByPromotionKey(options: {
    workspaceId: string;
    promotionKey: string;
  }): DerivedPrinciple | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM derived_principles
      WHERE workspace_id = ? AND promotion_key = ?
    `
      )
      .get(options.workspaceId, options.promotionKey) as
      | Record<string, unknown>
      | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Compute promotion key for idempotent pattern-to-derived promotion.
   * Key is deterministic based on pattern origin, not arbitrary pattern IDs.
   */
  static computePromotionKey(options: {
    workspaceId: string;
    patternKey: string;
    carrierStage: 'context-pack' | 'spec';
    findingCategory: string;
  }): string {
    return createHash('sha256')
      .update(
        `${options.workspaceId}|${options.patternKey}|${options.carrierStage}|${options.findingCategory}`
      )
      .digest('hex');
  }

  /**
   * Find recently archived derived principles (for potential re-promotion).
   */
  findRecentlyArchived(options: {
    workspaceId: string;
    withinDays?: number;
  }): DerivedPrinciple[] {
    const days = options.withinDays ?? 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString();

    const rows = this.db
      .prepare(
        `
      SELECT * FROM derived_principles
      WHERE workspace_id = ?
        AND origin = 'derived'
        AND status = 'archived'
        AND archived_at >= ?
    `
      )
      .all(options.workspaceId, cutoff) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Rollback a derived principle (set status to archived).
   */
  rollbackPromotion(options: { workspaceId: string; promotionKey: string }): boolean {
    const now = this.now();
    const result = this.db
      .prepare(
        `
      UPDATE derived_principles
      SET status = 'archived', archived_reason = 'rollback', archived_at = ?, updated_at = ?
      WHERE workspace_id = ? AND promotion_key = ? AND origin = 'derived'
    `
      )
      .run(now, now, options.workspaceId, options.promotionKey);

    return result.changes > 0;
  }

  /**
   * Create a new principle.
   */
  create(data: CreateInput): DerivedPrinciple {
    const id = randomUUID();
    const now = this.now();

    const principle: DerivedPrinciple = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    DerivedPrincipleSchema.parse(principle);

    // Extract workspaceId from scope
    const { workspaceId } = data.scope as { level: 'workspace'; workspaceId: string };

    this.db
      .prepare(
        `
      INSERT INTO derived_principles (
        id, workspace_id, principle, rationale, origin, derived_from,
        external_refs, inject_into, touches, technologies, task_types,
        confidence, status, permanent, superseded_by, promotion_key,
        archived_reason, archived_at, archived_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        workspaceId,
        principle.principle,
        principle.rationale,
        principle.origin,
        this.stringifyJsonField(principle.derivedFrom ?? []),
        this.stringifyJsonField(principle.externalRefs ?? []),
        principle.injectInto,
        this.stringifyJsonField(principle.touches),
        this.stringifyJsonField(principle.technologies ?? []),
        this.stringifyJsonField(principle.taskTypes ?? []),
        principle.confidence,
        principle.status,
        principle.permanent ? 1 : 0,
        principle.supersededBy ?? null,
        principle.promotionKey ?? null,
        principle.archivedReason ?? null,
        principle.archivedAt ?? null,
        principle.archivedBy ?? null,
        now,
        now
      );

    return principle;
  }

  /**
   * Update an existing principle.
   */
  update(id: string, data: Partial<DerivedPrinciple>): DerivedPrinciple | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: DerivedPrinciple = {
      ...existing,
      ...data,
      id: existing.id,
      scope: existing.scope, // Immutable
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    };

    DerivedPrincipleSchema.parse(updated);

    this.db
      .prepare(
        `
      UPDATE derived_principles SET
        principle = ?, rationale = ?, origin = ?, derived_from = ?,
        external_refs = ?, inject_into = ?, touches = ?, technologies = ?,
        task_types = ?, confidence = ?, status = ?, permanent = ?,
        superseded_by = ?, promotion_key = ?,
        archived_reason = ?, archived_at = ?, archived_by = ?,
        updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        updated.principle,
        updated.rationale,
        updated.origin,
        this.stringifyJsonField(updated.derivedFrom ?? []),
        this.stringifyJsonField(updated.externalRefs ?? []),
        updated.injectInto,
        this.stringifyJsonField(updated.touches),
        this.stringifyJsonField(updated.technologies ?? []),
        this.stringifyJsonField(updated.taskTypes ?? []),
        updated.confidence,
        updated.status,
        updated.permanent ? 1 : 0,
        updated.supersededBy ?? null,
        updated.promotionKey ?? null,
        updated.archivedReason ?? null,
        updated.archivedAt ?? null,
        updated.archivedBy ?? null,
        updated.updatedAt,
        id
      );

    return updated;
  }

  /**
   * Archive a principle.
   */
  archive(
    id: string,
    options?: { reason?: string; archivedBy?: string }
  ): boolean {
    const now = this.now();
    const result = this.db
      .prepare(
        `
      UPDATE derived_principles
      SET status = 'archived', archived_reason = ?, archived_at = ?, archived_by = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(options?.reason ?? null, now, options?.archivedBy ?? null, now, id);

    return result.changes > 0;
  }

  /**
   * Convert a database row to a DerivedPrinciple entity.
   */
  private rowToEntity(row: Record<string, unknown>): DerivedPrinciple {
    return {
      id: row.id as string,
      scope: { level: 'workspace', workspaceId: row.workspace_id as string },
      principle: row.principle as string,
      rationale: row.rationale as string,
      origin: row.origin as DerivedPrinciple['origin'],
      derivedFrom: this.parseJsonField<string[]>(row.derived_from as string),
      externalRefs: this.parseJsonField<string[]>(row.external_refs as string),
      injectInto: row.inject_into as DerivedPrinciple['injectInto'],
      touches: this.parseJsonField<Touch[]>(row.touches as string),
      technologies: this.parseJsonField<string[]>(row.technologies as string),
      taskTypes: this.parseJsonField<string[]>(row.task_types as string),
      confidence: row.confidence as number,
      status: row.status as DerivedPrinciple['status'],
      permanent: Boolean(row.permanent),
      supersededBy: (row.superseded_by as string) || undefined,
      promotionKey: (row.promotion_key as string) || undefined,
      archivedReason: (row.archived_reason as string) || undefined,
      archivedAt: (row.archived_at as string) || undefined,
      archivedBy: (row.archived_by as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
