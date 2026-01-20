/**
 * Execution Noncompliance repository.
 *
 * Manages records of when agents ignored correct guidance.
 * Distinct from Pattern - this is execution failure, not guidance failure.
 */

import { randomUUID } from 'crypto';
import type { ExecutionNoncompliance, NoncomplianceCause } from '../../schemas/index.js';
import { ExecutionNoncomplianceSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<ExecutionNoncompliance, 'id' | 'createdAt'>;

export class ExecutionNoncomplianceRepository extends BaseRepository<ExecutionNoncompliance> {
  /**
   * Find a noncompliance record by ID.
   */
  findById(id: string): ExecutionNoncompliance | null {
    const row = this.db
      .prepare('SELECT * FROM execution_noncompliance WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find noncompliance records by issue.
   */
  findByIssue(params: {
    workspaceId: string;
    projectId: string;
    issueId: string;
  }): ExecutionNoncompliance[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM execution_noncompliance
      WHERE workspace_id = ? AND project_id = ? AND issue_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(params.workspaceId, params.projectId, params.issueId) as Record<
        string,
        unknown
      >[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find noncompliance records by date range.
   * Used for Phase 5 salience detection.
   */
  findByDateRange(options: {
    workspaceId: string;
    projectId: string;
    startDate: string; // ISO 8601
    endDate: string; // ISO 8601
  }): ExecutionNoncompliance[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM execution_noncompliance
      WHERE workspace_id = ? AND project_id = ?
        AND created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `
      )
      .all(
        options.workspaceId,
        options.projectId,
        options.startDate,
        options.endDate
      ) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find all noncompliance records in a project.
   */
  findByProject(options: {
    workspaceId: string;
    projectId: string;
  }): ExecutionNoncompliance[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM execution_noncompliance
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Create a new noncompliance record.
   */
  create(data: CreateInput): ExecutionNoncompliance {
    const noncompliance: ExecutionNoncompliance = {
      id: randomUUID(),
      createdAt: this.now(),
      ...data,
    };

    ExecutionNoncomplianceSchema.parse(noncompliance);

    this.db
      .prepare(
        `
      INSERT INTO execution_noncompliance (
        id, workspace_id, project_id, finding_id, issue_id, pr_number,
        violated_guidance_stage, violated_guidance_location, violated_guidance_excerpt,
        possible_causes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        noncompliance.id,
        noncompliance.workspaceId,
        noncompliance.projectId,
        noncompliance.findingId,
        noncompliance.issueId,
        noncompliance.prNumber,
        noncompliance.violatedGuidanceStage,
        noncompliance.violatedGuidanceLocation,
        noncompliance.violatedGuidanceExcerpt,
        this.stringifyJsonField(noncompliance.possibleCauses),
        noncompliance.createdAt
      );

    return noncompliance;
  }

  /**
   * Convert a database row to an ExecutionNoncompliance entity.
   */
  private rowToEntity(row: Record<string, unknown>): ExecutionNoncompliance {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      findingId: row.finding_id as string,
      issueId: row.issue_id as string,
      prNumber: row.pr_number as number,
      violatedGuidanceStage: row.violated_guidance_stage as 'context-pack' | 'spec',
      violatedGuidanceLocation: row.violated_guidance_location as string,
      violatedGuidanceExcerpt: row.violated_guidance_excerpt as string,
      possibleCauses: this.parseJsonField<NoncomplianceCause[]>(
        row.possible_causes as string
      ),
      createdAt: row.created_at as string,
    };
  }
}
