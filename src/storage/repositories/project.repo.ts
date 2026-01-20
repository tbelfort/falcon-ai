/**
 * Project repository for managing projects within workspaces.
 */

import { randomUUID } from 'crypto';
import type { Project, ProjectConfig } from '../../schemas/index.js';
import { ProjectSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;

export class ProjectRepository extends BaseRepository<Project> {
  /**
   * Find a project by ID within a workspace.
   */
  findById(params: { workspaceId: string; id: string }): Project | null {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?')
      .get(params.id, params.workspaceId) as Record<string, unknown> | undefined;
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find a project by its unique identity (repo URL + subdir).
   */
  findByIdentity(params: {
    workspaceId: string;
    repoOriginUrl: string;
    repoSubdir?: string;
  }): Project | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM projects
      WHERE workspace_id = ? AND repo_origin_url = ?
        AND (repo_subdir = ? OR (repo_subdir IS NULL AND ? IS NULL))
    `
      )
      .get(
        params.workspaceId,
        params.repoOriginUrl,
        params.repoSubdir ?? null,
        params.repoSubdir ?? null
      ) as Record<string, unknown> | undefined;
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all projects in a workspace.
   */
  findByWorkspace(workspaceId: string, status?: 'active' | 'archived'): Project[] {
    let sql = 'SELECT * FROM projects WHERE workspace_id = ?';
    const params: unknown[] = [workspaceId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY name';

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find active projects in a workspace.
   */
  findActiveByWorkspace(workspaceId: string): Project[] {
    return this.findByWorkspace(workspaceId, 'active');
  }

  /**
   * Create a new project.
   */
  create(data: CreateInput): Project {
    const now = this.now();
    const project: Project = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    ProjectSchema.parse(project);

    this.db
      .prepare(
        `
      INSERT INTO projects (
        id, workspace_id, name, repo_origin_url, repo_subdir, repo_path,
        config, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        project.id,
        project.workspaceId,
        project.name,
        project.repoOriginUrl,
        project.repoSubdir ?? null,
        project.repoPath ?? null,
        this.stringifyJsonField(project.config),
        project.status,
        project.createdAt,
        project.updatedAt
      );

    return project;
  }

  /**
   * Update an existing project.
   */
  update(
    params: { workspaceId: string; id: string },
    data: Partial<Project>
  ): Project | null {
    const existing = this.findById(params);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...data,
      id: existing.id,
      workspaceId: existing.workspaceId, // Immutable
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    };

    ProjectSchema.parse(updated);

    this.db
      .prepare(
        `
      UPDATE projects
      SET name = ?, repo_origin_url = ?, repo_subdir = ?, repo_path = ?,
          config = ?, status = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `
      )
      .run(
        updated.name,
        updated.repoOriginUrl,
        updated.repoSubdir ?? null,
        updated.repoPath ?? null,
        this.stringifyJsonField(updated.config),
        updated.status,
        updated.updatedAt,
        params.id,
        params.workspaceId
      );

    return updated;
  }

  /**
   * Archive a project (soft delete).
   */
  archive(params: { workspaceId: string; id: string }): boolean {
    const result = this.db
      .prepare(
        `
      UPDATE projects SET status = 'archived', updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `
      )
      .run(this.now(), params.id, params.workspaceId);

    return result.changes > 0;
  }

  /**
   * Convert a database row to a Project entity.
   */
  private rowToEntity(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      name: row.name as string,
      repoOriginUrl: row.repo_origin_url as string,
      repoSubdir: (row.repo_subdir as string) || undefined,
      repoPath: (row.repo_path as string) || undefined,
      config: this.parseJsonFieldObject<ProjectConfig>(row.config as string, {}),
      status: row.status as 'active' | 'archived',
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
