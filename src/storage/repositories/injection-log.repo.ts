/**
 * Injection Log repository.
 *
 * Manages records of what was injected into context packs and specs.
 */

import { randomUUID } from 'crypto';
import type { InjectionLog, TaskProfile } from '../../schemas/index.js';
import { InjectionLogSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<InjectionLog, 'id' | 'injectedAt'>;

export class InjectionLogRepository extends BaseRepository<InjectionLog> {
  /**
   * Find an injection log by ID.
   */
  findById(id: string): InjectionLog | null {
    const row = this.db
      .prepare('SELECT * FROM injection_logs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find logs by issue (scoped).
   */
  findByIssueId(options: {
    workspaceId: string;
    projectId: string;
    issueId: string;
  }): InjectionLog[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM injection_logs
      WHERE workspace_id = ? AND project_id = ? AND issue_id = ?
      ORDER BY injected_at DESC
    `
      )
      .all(options.workspaceId, options.projectId, options.issueId) as Record<
        string,
        unknown
      >[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find by target (scoped).
   */
  findByTarget(options: {
    workspaceId: string;
    projectId: string;
    issueId: string;
    target: 'context-pack' | 'spec';
  }): InjectionLog | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM injection_logs
      WHERE workspace_id = ? AND project_id = ? AND issue_id = ? AND target = ?
    `
      )
      .get(options.workspaceId, options.projectId, options.issueId, options.target) as
      | Record<string, unknown>
      | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all logs in a project.
   */
  findByProject(options: {
    workspaceId: string;
    projectId: string;
  }): InjectionLog[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM injection_logs
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY injected_at DESC
    `
      )
      .all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find logs within a date range.
   */
  findByDateRange(options: {
    workspaceId: string;
    projectId: string;
    startDate: string;
    endDate: string;
  }): InjectionLog[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM injection_logs
      WHERE workspace_id = ? AND project_id = ?
        AND injected_at >= ? AND injected_at <= ?
      ORDER BY injected_at DESC
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
   * Create a new injection log.
   */
  create(data: CreateInput): InjectionLog {
    const log: InjectionLog = {
      id: randomUUID(),
      injectedAt: this.now(),
      ...data,
    };

    InjectionLogSchema.parse(log);

    this.db
      .prepare(
        `
      INSERT INTO injection_logs (
        id, workspace_id, project_id, issue_id, target,
        injected_patterns, injected_principles, injected_alerts,
        task_profile, injected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
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

  /**
   * Convert a database row to an InjectionLog entity.
   */
  private rowToEntity(row: Record<string, unknown>): InjectionLog {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      issueId: row.issue_id as string,
      target: row.target as InjectionLog['target'],
      injectedPatterns: this.parseJsonField<string[]>(row.injected_patterns as string),
      injectedPrinciples: this.parseJsonField<string[]>(
        row.injected_principles as string
      ),
      injectedAlerts: this.parseJsonField<string[]>(row.injected_alerts as string),
      taskProfile: this.parseJsonFieldObject<TaskProfile>(row.task_profile as string, {
        touches: [],
        technologies: [],
        taskTypes: [],
        confidence: 0,
      }),
      injectedAt: row.injected_at as string,
    };
  }
}
