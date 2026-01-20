/**
 * Workspace repository for managing workspaces.
 */

import { randomUUID } from 'crypto';
import type { Workspace, WorkspaceConfig } from '../../schemas/index.js';
import { WorkspaceSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>;

export class WorkspaceRepository extends BaseRepository<Workspace> {
  /**
   * Find a workspace by ID.
   */
  findById(id: string): Workspace | null {
    const row = this.db
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find a workspace by slug.
   */
  findBySlug(slug: string): Workspace | null {
    const row = this.db
      .prepare('SELECT * FROM workspaces WHERE slug = ?')
      .get(slug) as Record<string, unknown> | undefined;
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all active workspaces.
   */
  findActive(): Workspace[] {
    const rows = this.db
      .prepare("SELECT * FROM workspaces WHERE status = 'active' ORDER BY name")
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find all workspaces (including archived).
   */
  findAll(): Workspace[] {
    const rows = this.db
      .prepare('SELECT * FROM workspaces ORDER BY name')
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Create a new workspace.
   */
  create(data: CreateInput): Workspace {
    const now = this.now();
    const workspace: Workspace = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    WorkspaceSchema.parse(workspace);

    this.db
      .prepare(
        `
      INSERT INTO workspaces (id, name, slug, config, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        workspace.id,
        workspace.name,
        workspace.slug,
        this.stringifyJsonField(workspace.config),
        workspace.status,
        workspace.createdAt,
        workspace.updatedAt
      );

    return workspace;
  }

  /**
   * Update an existing workspace.
   */
  update(id: string, data: Partial<Workspace>): Workspace | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: Workspace = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    };

    WorkspaceSchema.parse(updated);

    this.db
      .prepare(
        `
      UPDATE workspaces
      SET name = ?, slug = ?, config = ?, status = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        updated.name,
        updated.slug,
        this.stringifyJsonField(updated.config),
        updated.status,
        updated.updatedAt,
        id
      );

    return updated;
  }

  /**
   * Archive a workspace (soft delete).
   */
  archive(id: string): boolean {
    const result = this.db
      .prepare(
        `
      UPDATE workspaces SET status = 'archived', updated_at = ? WHERE id = ?
    `
      )
      .run(this.now(), id);

    return result.changes > 0;
  }

  /**
   * Convert a database row to a Workspace entity.
   */
  private rowToEntity(row: Record<string, unknown>): Workspace {
    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      config: this.parseJsonFieldObject<WorkspaceConfig>(row.config as string, {}),
      status: row.status as 'active' | 'archived',
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
