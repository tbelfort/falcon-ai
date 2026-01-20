/**
 * Pattern Definition repository.
 *
 * Manages reusable patterns representing bad guidance with:
 * - Deterministic patternKey deduplication
 * - severityMax tracking across occurrences
 * - Cross-project pattern queries
 */

import { randomUUID, createHash } from 'crypto';
import type { PatternDefinition, Touch, Severity } from '../../schemas/index.js';
import { PatternDefinitionSchema } from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

// Input for creating a pattern - id, patternKey, contentHash, severityMax, timestamps are auto-generated
type CreateInput = Omit<
  PatternDefinition,
  'id' | 'patternKey' | 'contentHash' | 'severityMax' | 'createdAt' | 'updatedAt'
>;

export class PatternDefinitionRepository extends BaseRepository<PatternDefinition> {
  /**
   * Find a pattern by ID.
   */
  findById(id: string): PatternDefinition | null {
    const row = this.db
      .prepare('SELECT * FROM pattern_definitions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find by patternKey (deterministic uniqueness key) - scoped to workspace+project.
   */
  findByPatternKey(options: {
    workspaceId: string;
    projectId: string;
    patternKey: string;
  }): PatternDefinition | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM pattern_definitions
      WHERE workspace_id = ? AND project_id = ? AND pattern_key = ?
    `
      )
      .get(options.workspaceId, options.projectId, options.patternKey) as
      | Record<string, unknown>
      | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find active patterns within a scope.
   */
  findActive(options: {
    workspaceId: string;
    projectId: string;
    carrierStage?: 'context-pack' | 'spec';
    findingCategory?: PatternDefinition['findingCategory'];
  }): PatternDefinition[] {
    let sql =
      'SELECT * FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND status = ?';
    const params: unknown[] = [options.workspaceId, options.projectId, 'active'];

    if (options.carrierStage) {
      sql += ' AND carrier_stage = ?';
      params.push(options.carrierStage);
    }

    if (options.findingCategory) {
      sql += ' AND finding_category = ?';
      params.push(options.findingCategory);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find patterns matching any of the given touches.
   */
  findByTouches(
    scope: { workspaceId: string; projectId: string },
    touches: Touch[]
  ): PatternDefinition[] {
    const all = this.findActive({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    });
    return all.filter((p) => p.touches.some((t) => touches.includes(t)));
  }

  /**
   * Find patterns matching both touches AND category.
   * Used for alert-to-pattern promotion.
   */
  findByTouchesAndCategory(options: {
    workspaceId: string;
    projectId: string;
    touches: Touch[];
    findingCategory: PatternDefinition['findingCategory'];
    status?: 'active' | 'archived' | 'superseded';
  }): PatternDefinition[] {
    const statusFilter = options.status ?? 'active';
    const rows = this.db
      .prepare(
        `
      SELECT * FROM pattern_definitions
      WHERE workspace_id = ? AND project_id = ? AND status = ? AND finding_category = ?
    `
      )
      .all(
        options.workspaceId,
        options.projectId,
        statusFilter,
        options.findingCategory
      ) as Record<string, unknown>[];

    const patterns = rows.map((row) => this.rowToEntity(row));
    // Filter by touches in memory (JSON field)
    return patterns.filter((p) => p.touches.some((t) => options.touches.includes(t)));
  }

  /**
   * Find patterns from OTHER projects in same workspace (for cross-project warnings).
   * Used for security patterns that should be shared across projects.
   */
  findCrossProject(options: {
    workspaceId: string;
    excludeProjectId: string;
    carrierStage?: 'context-pack' | 'spec';
    minSeverity?: Severity;
    findingCategory?: string; // Filter by category (security-only recommended)
  }): PatternDefinition[] {
    let sql = `
      SELECT * FROM pattern_definitions
      WHERE workspace_id = ?
        AND project_id != ?
        AND status = ?
    `;
    const params: unknown[] = [options.workspaceId, options.excludeProjectId, 'active'];

    if (options.carrierStage) {
      sql += ' AND carrier_stage = ?';
      params.push(options.carrierStage);
    }

    if (options.minSeverity) {
      // Filter to patterns where severityMax >= minSeverity
      const minRank = this.severityRank(options.minSeverity);
      sql += ` AND (
        CASE severity_max
          WHEN 'CRITICAL' THEN 4
          WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2
          WHEN 'LOW' THEN 1
        END
      ) >= ?`;
      params.push(minRank);
    }

    if (options.findingCategory) {
      sql += ' AND finding_category = ?';
      params.push(options.findingCategory);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Compute patternKey deterministically from carrier stage, content, and category.
   */
  private computePatternKey(
    carrierStage: string,
    patternContent: string,
    findingCategory: string
  ): string {
    const normalized = patternContent.trim().toLowerCase().replace(/\s+/g, ' ');
    return createHash('sha256')
      .update(`${carrierStage}|${normalized}|${findingCategory}`)
      .digest('hex');
  }

  /**
   * Create a new pattern or return existing if same patternKey.
   * Updates severityMax if new occurrence has higher severity.
   */
  create(data: CreateInput): PatternDefinition {
    const now = this.now();
    const contentHash = createHash('sha256')
      .update(data.patternContent.trim().toLowerCase())
      .digest('hex');

    // Extract scope IDs (scope must be project-level per Zod validation)
    const { workspaceId, projectId } = data.scope as {
      level: 'project';
      workspaceId: string;
      projectId: string;
    };

    // Compute patternKey for deduplication
    const patternKey = this.computePatternKey(
      data.carrierStage,
      data.patternContent,
      data.findingCategory
    );

    // Check for existing by patternKey within same scope (deduplication)
    const existing = this.findByPatternKey({ workspaceId, projectId, patternKey });
    if (existing) {
      // Update severityMax if new occurrence has higher severity
      if (this.severityRank(data.severity) > this.severityRank(existing.severityMax)) {
        return this.update(existing.id, { severityMax: data.severity })!;
      }
      return existing;
    }

    const pattern: PatternDefinition = {
      id: randomUUID(),
      patternKey,
      contentHash,
      severityMax: data.severity, // Initialize to first occurrence severity
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    // Validate with Zod
    PatternDefinitionSchema.parse(pattern);

    this.db
      .prepare(
        `
      INSERT INTO pattern_definitions (
        id, workspace_id, project_id, pattern_key, content_hash, pattern_content,
        failure_mode, finding_category, severity, severity_max, alternative,
        consequence_class, carrier_stage, primary_carrier_quote_type,
        technologies, task_types, touches, aligned_baseline_id,
        status, permanent, superseded_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        pattern.id,
        workspaceId,
        projectId,
        pattern.patternKey,
        pattern.contentHash,
        pattern.patternContent,
        pattern.failureMode,
        pattern.findingCategory,
        pattern.severity,
        pattern.severityMax,
        pattern.alternative,
        pattern.consequenceClass ?? null,
        pattern.carrierStage,
        pattern.primaryCarrierQuoteType,
        this.stringifyJsonField(pattern.technologies),
        this.stringifyJsonField(pattern.taskTypes),
        this.stringifyJsonField(pattern.touches),
        pattern.alignedBaselineId ?? null,
        pattern.status,
        this.boolToInt(pattern.permanent),
        pattern.supersededBy ?? null,
        pattern.createdAt,
        pattern.updatedAt
      );

    return pattern;
  }

  /**
   * Create pattern from promoted ProvisionalAlert (used by Phase 4).
   */
  createFromProvisionalAlert(options: {
    workspaceId: string;
    projectId: string;
    alert: {
      findingId: string;
      issueId: string;
      message: string;
      touches: Touch[];
      injectInto: 'context-pack' | 'spec' | 'both';
    };
    stats: {
      occurrenceCount: number;
      uniqueIssueCount: number;
      averageConfidence: number;
    };
  }): PatternDefinition {
    return this.create({
      scope: {
        level: 'project',
        workspaceId: options.workspaceId,
        projectId: options.projectId,
      },
      patternContent: options.alert.message,
      failureMode: 'incomplete', // Default for promoted alerts
      findingCategory: 'correctness', // Default category
      severity: 'HIGH', // Alerts are created for CRITICAL findings
      alternative: 'See original alert message for guidance',
      carrierStage:
        options.alert.injectInto === 'both' ? 'context-pack' : options.alert.injectInto,
      primaryCarrierQuoteType: 'inferred',
      technologies: [],
      taskTypes: [],
      touches: options.alert.touches,
      status: 'active',
      permanent: false,
    });
  }

  /**
   * Update an existing pattern.
   * Note: patternContent is IMMUTABLE.
   */
  update(id: string, data: Partial<PatternDefinition>): PatternDefinition | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: PatternDefinition = {
      ...existing,
      ...data,
      id: existing.id,
      patternKey: existing.patternKey,
      contentHash: existing.contentHash,
      patternContent: existing.patternContent, // IMMUTABLE
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    };

    PatternDefinitionSchema.parse(updated);

    this.db
      .prepare(
        `
      UPDATE pattern_definitions SET
        failure_mode = ?, finding_category = ?,
        severity = ?, severity_max = ?, alternative = ?, consequence_class = ?,
        carrier_stage = ?, primary_carrier_quote_type = ?,
        technologies = ?, task_types = ?, touches = ?,
        aligned_baseline_id = ?, status = ?, permanent = ?,
        superseded_by = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        updated.failureMode,
        updated.findingCategory,
        updated.severity,
        updated.severityMax,
        updated.alternative,
        updated.consequenceClass ?? null,
        updated.carrierStage,
        updated.primaryCarrierQuoteType,
        this.stringifyJsonField(updated.technologies),
        this.stringifyJsonField(updated.taskTypes),
        this.stringifyJsonField(updated.touches),
        updated.alignedBaselineId ?? null,
        updated.status,
        this.boolToInt(updated.permanent),
        updated.supersededBy ?? null,
        updated.updatedAt,
        id
      );

    return updated;
  }

  /**
   * Archive a pattern.
   */
  archive(id: string): boolean {
    const result = this.db
      .prepare(
        `
      UPDATE pattern_definitions SET status = 'archived', updated_at = ? WHERE id = ?
    `
      )
      .run(this.now(), id);

    return result.changes > 0;
  }

  /**
   * Helper to rank severity for comparison.
   */
  private severityRank(severity: Severity): number {
    const ranks: Record<Severity, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };
    return ranks[severity];
  }

  /**
   * Convert a database row to a PatternDefinition entity.
   */
  private rowToEntity(row: Record<string, unknown>): PatternDefinition {
    return {
      id: row.id as string,
      scope: {
        level: 'project' as const,
        workspaceId: row.workspace_id as string,
        projectId: row.project_id as string,
      },
      patternKey: row.pattern_key as string,
      contentHash: row.content_hash as string,
      patternContent: row.pattern_content as string,
      failureMode: row.failure_mode as PatternDefinition['failureMode'],
      findingCategory: row.finding_category as PatternDefinition['findingCategory'],
      severity: row.severity as PatternDefinition['severity'],
      severityMax: row.severity_max as PatternDefinition['severity'],
      alternative: row.alternative as string,
      consequenceClass: (row.consequence_class as string) || undefined,
      carrierStage: row.carrier_stage as PatternDefinition['carrierStage'],
      primaryCarrierQuoteType:
        row.primary_carrier_quote_type as PatternDefinition['primaryCarrierQuoteType'],
      technologies: this.parseJsonField<string[]>(row.technologies as string),
      taskTypes: this.parseJsonField<string[]>(row.task_types as string),
      touches: this.parseJsonField<Touch[]>(row.touches as string),
      alignedBaselineId: (row.aligned_baseline_id as string) || undefined,
      status: row.status as PatternDefinition['status'],
      permanent: this.intToBool(row.permanent as number),
      supersededBy: (row.superseded_by as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
