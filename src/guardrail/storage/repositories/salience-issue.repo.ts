/**
 * Salience Issue repository.
 *
 * Tracks guidance that is repeatedly ignored.
 * Uses upsert pattern for automatic occurrence counting.
 */

import { randomUUID, createHash } from 'crypto';
import type { SalienceIssue } from '../../schemas/index.js';
import { SalienceIssueSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<
  SalienceIssue,
  'id' | 'guidanceLocationHash' | 'createdAt' | 'updatedAt'
>;

export class SalienceIssueRepository extends BaseRepository<SalienceIssue> {
  /**
   * Find an issue by ID.
   */
  findById(id: string): SalienceIssue | null {
    const row = this.db
      .prepare('SELECT * FROM salience_issues WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find by location hash (unique within project).
   */
  findByLocationHash(options: {
    workspaceId: string;
    projectId: string;
    hash: string;
  }): SalienceIssue | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM salience_issues
      WHERE workspace_id = ? AND project_id = ? AND guidance_location_hash = ?
    `
      )
      .get(options.workspaceId, options.projectId, options.hash) as
      | Record<string, unknown>
      | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find pending issues in a project.
   */
  findPending(options: {
    workspaceId: string;
    projectId: string;
  }): SalienceIssue[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM salience_issues
      WHERE workspace_id = ? AND project_id = ? AND status = 'pending'
      ORDER BY occurrence_count DESC, created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find all issues in a project.
   */
  findByProject(options: {
    workspaceId: string;
    projectId: string;
  }): SalienceIssue[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM salience_issues
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Compute location hash for lookup.
   */
  computeLocationHash(stage: string, location: string, excerpt: string): string {
    return createHash('sha256')
      .update(`${stage}|${location}|${excerpt}`)
      .digest('hex');
  }

  /**
   * Create or update (increment count if exists).
   * This is the main entry point for recording salience issues.
   */
  upsert(data: CreateInput, noncomplianceId: string): SalienceIssue {
    const hash = this.computeLocationHash(
      data.guidanceStage,
      data.guidanceLocation,
      data.guidanceExcerpt
    );

    const existing = this.findByLocationHash({
      workspaceId: data.workspaceId,
      projectId: data.projectId,
      hash,
    });

    if (existing) {
      // Increment count and add noncompliance ID
      const updatedIds = [...existing.noncomplianceIds, noncomplianceId];
      return this.update(existing.id, {
        occurrenceCount: existing.occurrenceCount + 1,
        noncomplianceIds: updatedIds,
      })!;
    }

    const now = this.now();
    const issue: SalienceIssue = {
      ...data,
      id: randomUUID(),
      guidanceLocationHash: hash,
      noncomplianceIds: [noncomplianceId],
      createdAt: now,
      updatedAt: now,
    };

    SalienceIssueSchema.parse(issue);

    this.db
      .prepare(
        `
      INSERT INTO salience_issues (
        id, workspace_id, project_id, guidance_location_hash, guidance_stage,
        guidance_location, guidance_excerpt, occurrence_count, window_days,
        noncompliance_ids, status, resolution, created_at, updated_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        issue.id,
        issue.workspaceId,
        issue.projectId,
        issue.guidanceLocationHash,
        issue.guidanceStage,
        issue.guidanceLocation,
        issue.guidanceExcerpt,
        issue.occurrenceCount,
        issue.windowDays,
        this.stringifyJsonField(issue.noncomplianceIds),
        issue.status,
        issue.resolution ?? null,
        issue.createdAt,
        issue.updatedAt,
        issue.resolvedAt ?? null
      );

    return issue;
  }

  /**
   * Update an existing issue.
   */
  update(id: string, data: Partial<SalienceIssue>): SalienceIssue | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = this.now();
    const updated: SalienceIssue = {
      ...existing,
      ...data,
      id: existing.id,
      workspaceId: existing.workspaceId, // Immutable
      projectId: existing.projectId, // Immutable
      guidanceLocationHash: existing.guidanceLocationHash,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    SalienceIssueSchema.parse(updated);

    this.db
      .prepare(
        `
      UPDATE salience_issues SET
        occurrence_count = ?, noncompliance_ids = ?,
        status = ?, resolution = ?, updated_at = ?, resolved_at = ?
      WHERE id = ?
    `
      )
      .run(
        updated.occurrenceCount,
        this.stringifyJsonField(updated.noncomplianceIds),
        updated.status,
        updated.resolution ?? null,
        updated.updatedAt,
        updated.resolvedAt ?? null,
        id
      );

    return updated;
  }

  /**
   * Resolve a salience issue.
   */
  resolve(options: {
    id: string;
    resolution: 'reformatted' | 'moved_earlier' | 'false_positive';
  }): SalienceIssue | null {
    const now = this.now();
    const result = this.db
      .prepare(
        `
      UPDATE salience_issues
      SET status = 'resolved', resolution = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(options.resolution, now, now, options.id);

    if (result.changes === 0) return null;
    return this.findById(options.id);
  }

  /**
   * Convert a database row to a SalienceIssue entity.
   */
  private rowToEntity(row: Record<string, unknown>): SalienceIssue {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      guidanceLocationHash: row.guidance_location_hash as string,
      guidanceStage: row.guidance_stage as SalienceIssue['guidanceStage'],
      guidanceLocation: row.guidance_location as string,
      guidanceExcerpt: row.guidance_excerpt as string,
      occurrenceCount: row.occurrence_count as number,
      windowDays: row.window_days as number,
      noncomplianceIds: this.parseJsonField<string[]>(row.noncompliance_ids as string),
      status: row.status as SalienceIssue['status'],
      resolution: (row.resolution as SalienceIssue['resolution']) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      resolvedAt: (row.resolved_at as string) || undefined,
    };
  }
}
