/**
 * Tagging Miss repository.
 *
 * Manages records of patterns that should have matched but weren't injected.
 */

import { randomUUID } from 'crypto';
import type { TaggingMiss, TaskProfile } from '../../schemas/index.js';
import { TaggingMissSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<TaggingMiss, 'id' | 'createdAt'>;

export class TaggingMissRepository extends BaseRepository<TaggingMiss> {
  /**
   * Find a tagging miss by ID.
   */
  findById(id: string): TaggingMiss | null {
    const row = this.db
      .prepare('SELECT * FROM tagging_misses WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find pending misses in a project.
   */
  findPending(options: {
    workspaceId: string;
    projectId: string;
  }): TaggingMiss[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM tagging_misses
      WHERE workspace_id = ? AND project_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find misses by pattern.
   */
  findByPatternId(options: {
    workspaceId: string;
    patternId: string;
  }): TaggingMiss[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM tagging_misses
      WHERE workspace_id = ? AND pattern_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.patternId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find all misses in a project.
   */
  findByProject(options: {
    workspaceId: string;
    projectId: string;
  }): TaggingMiss[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM tagging_misses
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Create a new tagging miss.
   */
  create(data: CreateInput): TaggingMiss {
    const miss: TaggingMiss = {
      id: randomUUID(),
      createdAt: this.now(),
      ...data,
    };

    TaggingMissSchema.parse(miss);

    this.db
      .prepare(
        `
      INSERT INTO tagging_misses (
        id, workspace_id, project_id, finding_id, pattern_id,
        actual_task_profile, required_match, missing_tags,
        status, resolution, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        miss.id,
        miss.workspaceId,
        miss.projectId,
        miss.findingId,
        miss.patternId,
        this.stringifyJsonField(miss.actualTaskProfile),
        this.stringifyJsonField(miss.requiredMatch),
        this.stringifyJsonField(miss.missingTags),
        miss.status,
        miss.resolution ?? null,
        miss.createdAt,
        miss.resolvedAt ?? null
      );

    return miss;
  }

  /**
   * Resolve a tagging miss.
   */
  resolve(options: {
    id: string;
    resolution: 'broadened_pattern' | 'improved_extraction' | 'false_positive';
  }): TaggingMiss | null {
    const existing = this.findById(options.id);
    if (!existing) return null;

    const now = this.now();

    this.db
      .prepare(
        `
      UPDATE tagging_misses
      SET status = 'resolved', resolution = ?, resolved_at = ?
      WHERE id = ?
    `
      )
      .run(options.resolution, now, options.id);

    return this.findById(options.id);
  }

  /**
   * Convert a database row to a TaggingMiss entity.
   */
  private rowToEntity(row: Record<string, unknown>): TaggingMiss {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      findingId: row.finding_id as string,
      patternId: row.pattern_id as string,
      actualTaskProfile: this.parseJsonField<TaskProfile>(
        row.actual_task_profile as string
      ),
      requiredMatch: this.parseJsonField<TaggingMiss['requiredMatch']>(
        row.required_match as string
      ),
      missingTags: this.parseJsonField<string[]>(row.missing_tags as string),
      status: row.status as TaggingMiss['status'],
      resolution: (row.resolution as TaggingMiss['resolution']) || undefined,
      createdAt: row.created_at as string,
      resolvedAt: (row.resolved_at as string) || undefined,
    };
  }
}
