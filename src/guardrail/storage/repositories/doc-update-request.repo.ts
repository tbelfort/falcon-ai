/**
 * Doc Update Request repository.
 *
 * Manages documentation update requests with decision class tracking.
 */

import { randomUUID } from 'crypto';
import type {
  DocUpdateRequest,
  FindingCategory,
  DocUpdateType,
  DecisionClass,
} from '../../schemas/index.js';
import { DocUpdateRequestSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

type CreateInput = Omit<DocUpdateRequest, 'id' | 'createdAt'>;

export class DocUpdateRequestRepository extends BaseRepository<DocUpdateRequest> {
  /**
   * Find a request by ID.
   */
  findById(id: string): DocUpdateRequest | null {
    const row = this.db
      .prepare('SELECT * FROM doc_update_requests WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find pending requests in a project.
   */
  findPending(params: {
    workspaceId: string;
    projectId: string;
  }): DocUpdateRequest[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM doc_update_requests
      WHERE workspace_id = ? AND project_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `
      )
      .all(params.workspaceId, params.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find requests by decision class.
   */
  findByDecisionClass(params: {
    workspaceId: string;
    projectId: string;
    decisionClass: string;
  }): DocUpdateRequest[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM doc_update_requests
      WHERE workspace_id = ? AND project_id = ? AND decision_class = ?
      ORDER BY created_at DESC
    `
      )
      .all(params.workspaceId, params.projectId, params.decisionClass) as Record<
        string,
        unknown
      >[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find requests by finding category.
   */
  findByCategory(params: {
    workspaceId: string;
    projectId: string;
    findingCategory: FindingCategory;
  }): DocUpdateRequest[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM doc_update_requests
      WHERE workspace_id = ? AND project_id = ? AND finding_category = ?
      ORDER BY created_at DESC
    `
      )
      .all(params.workspaceId, params.projectId, params.findingCategory) as Record<
        string,
        unknown
      >[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find all requests in a project.
   */
  findByProject(params: {
    workspaceId: string;
    projectId: string;
  }): DocUpdateRequest[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM doc_update_requests
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(params.workspaceId, params.projectId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Create a new request.
   */
  create(data: CreateInput): DocUpdateRequest {
    const request: DocUpdateRequest = {
      id: randomUUID(),
      createdAt: this.now(),
      ...data,
    };

    DocUpdateRequestSchema.parse(request);

    this.db
      .prepare(
        `
      INSERT INTO doc_update_requests (
        id, workspace_id, project_id, finding_id, issue_id, finding_category, scout_type,
        decision_class, target_doc, update_type, description, suggested_content,
        status, completed_at, rejection_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        request.id,
        request.workspaceId,
        request.projectId,
        request.findingId,
        request.issueId,
        request.findingCategory,
        request.scoutType,
        request.decisionClass ?? null,
        request.targetDoc,
        request.updateType,
        request.description,
        request.suggestedContent ?? null,
        request.status,
        request.completedAt ?? null,
        request.rejectionReason ?? null,
        request.createdAt
      );

    return request;
  }

  /**
   * Update an existing request.
   */
  update(id: string, data: Partial<DocUpdateRequest>): DocUpdateRequest | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: DocUpdateRequest = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    DocUpdateRequestSchema.parse(updated);

    this.db
      .prepare(
        `
      UPDATE doc_update_requests
      SET status = ?, completed_at = ?, rejection_reason = ?
      WHERE id = ?
    `
      )
      .run(
        updated.status,
        updated.completedAt ?? null,
        updated.rejectionReason ?? null,
        id
      );

    return updated;
  }

  /**
   * Mark a request as completed.
   */
  complete(id: string): DocUpdateRequest | null {
    return this.update(id, {
      status: 'completed',
      completedAt: this.now(),
    });
  }

  /**
   * Reject a request.
   */
  reject(id: string, reason: string): DocUpdateRequest | null {
    return this.update(id, {
      status: 'rejected',
      rejectionReason: reason,
    });
  }

  /**
   * Convert a database row to a DocUpdateRequest entity.
   */
  private rowToEntity(row: Record<string, unknown>): DocUpdateRequest {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      findingId: row.finding_id as string,
      issueId: row.issue_id as string,
      findingCategory: row.finding_category as FindingCategory,
      scoutType: row.scout_type as string,
      decisionClass: (row.decision_class as DecisionClass) || undefined,
      targetDoc: row.target_doc as string,
      updateType: row.update_type as DocUpdateType,
      description: row.description as string,
      suggestedContent: (row.suggested_content as string) || undefined,
      status: row.status as 'pending' | 'completed' | 'rejected',
      completedAt: (row.completed_at as string) || undefined,
      rejectionReason: (row.rejection_reason as string) || undefined,
      createdAt: row.created_at as string,
    };
  }
}
