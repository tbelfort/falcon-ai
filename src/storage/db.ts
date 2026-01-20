/**
 * Database initialization and connection management.
 *
 * Uses better-sqlite3 for SQLite database access.
 * Database is stored at ~/.falcon-ai/db/falcon.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const FALCON_DIR = path.join(os.homedir(), '.falcon-ai');
const DB_DIR = path.join(FALCON_DIR, 'db');
const DB_PATH = path.join(DB_DIR, 'falcon.db');

let db: Database.Database | null = null;

/**
 * Get the database connection, creating it if necessary.
 *
 * The database is lazily initialized on first access.
 * All tables are created on first access to ensure commands like
 * `falcon status` work immediately after `falcon init`.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure directories exist
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 20000');

    runMigrations(db);
  }
  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the database file path.
 */
export function getDatabasePath(): string {
  return DB_PATH;
}

/**
 * Initialize a database instance with migrations.
 *
 * Used primarily for testing with in-memory databases.
 *
 * @param dbInstance - The database instance to initialize
 */
export function initializeDatabase(dbInstance: Database.Database): void {
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  runMigrations(dbInstance);
}

/**
 * Run database migrations.
 *
 * Creates all tables needed by the entire system.
 * This is idempotent - running multiple times is safe.
 */
function runMigrations(db: Database.Database): void {
  db.exec(`
    -- ============================================
    -- CORE TABLES (Phase 0)
    -- ============================================

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      repo_path TEXT,
      repo_origin_url TEXT NOT NULL,
      repo_subdir TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_identity
      ON projects(workspace_id, repo_origin_url, repo_subdir);
    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

    -- ============================================
    -- PATTERN TABLES (Phase 1 data, Phase 2 writes)
    -- ============================================

    CREATE TABLE IF NOT EXISTS pattern_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      pattern_key TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      pattern_content TEXT NOT NULL,
      failure_mode TEXT NOT NULL CHECK (failure_mode IN ('incorrect', 'incomplete', 'missing_reference', 'ambiguous', 'conflict_unresolved', 'synthesis_drift')),
      finding_category TEXT NOT NULL CHECK (finding_category IN ('security', 'correctness', 'testing', 'compliance', 'decisions')),
      severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      severity_max TEXT NOT NULL CHECK (severity_max IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      alternative TEXT NOT NULL,
      consequence_class TEXT,
      carrier_stage TEXT NOT NULL CHECK (carrier_stage IN ('context-pack', 'spec')),
      primary_carrier_quote_type TEXT NOT NULL CHECK (primary_carrier_quote_type IN ('verbatim', 'paraphrase', 'inferred')),
      technologies TEXT NOT NULL DEFAULT '[]',
      task_types TEXT NOT NULL DEFAULT '[]',
      touches TEXT NOT NULL DEFAULT '[]',
      aligned_baseline_id TEXT REFERENCES derived_principles(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
      permanent INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT REFERENCES pattern_definitions(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_scope_key
      ON pattern_definitions(workspace_id, project_id, pattern_key);
    CREATE INDEX IF NOT EXISTS idx_patterns_status ON pattern_definitions(status);
    CREATE INDEX IF NOT EXISTS idx_patterns_carrier_stage ON pattern_definitions(carrier_stage);
    CREATE INDEX IF NOT EXISTS idx_patterns_finding_category ON pattern_definitions(finding_category);
    CREATE INDEX IF NOT EXISTS idx_patterns_workspace ON pattern_definitions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_patterns_project ON pattern_definitions(project_id);

    CREATE TABLE IF NOT EXISTS pattern_occurrences (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      pattern_id TEXT NOT NULL REFERENCES pattern_definitions(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      evidence TEXT NOT NULL,
      carrier_fingerprint TEXT NOT NULL,
      origin_fingerprint TEXT,
      provenance_chain TEXT NOT NULL DEFAULT '[]',
      carrier_excerpt_hash TEXT NOT NULL,
      origin_excerpt_hash TEXT,
      was_injected INTEGER NOT NULL DEFAULT 0,
      was_adhered_to INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      inactive_reason TEXT CHECK (inactive_reason IS NULL OR inactive_reason IN ('superseded_doc', 'pattern_archived', 'false_positive')),
      provisional_alert_id TEXT REFERENCES provisional_alerts(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_occurrences_pattern_id ON pattern_occurrences(pattern_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_issue_id ON pattern_occurrences(issue_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_status ON pattern_occurrences(status);
    CREATE INDEX IF NOT EXISTS idx_occurrences_workspace ON pattern_occurrences(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_project ON pattern_occurrences(project_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_created_at ON pattern_occurrences(created_at);

    -- ============================================
    -- PRINCIPLE TABLES (Phase 1 data, Phase 3 reads)
    -- ============================================

    CREATE TABLE IF NOT EXISTS derived_principles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      principle TEXT NOT NULL,
      rationale TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('baseline', 'derived')),
      derived_from TEXT,
      external_refs TEXT,
      inject_into TEXT NOT NULL CHECK (inject_into IN ('context-pack', 'spec', 'both')),
      touches TEXT NOT NULL DEFAULT '[]',
      technologies TEXT,
      task_types TEXT,
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
      permanent INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT REFERENCES derived_principles(id),
      promotion_key TEXT,
      archived_reason TEXT,
      archived_at TEXT,
      archived_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_principles_status ON derived_principles(status);
    CREATE INDEX IF NOT EXISTS idx_principles_origin ON derived_principles(origin);
    CREATE INDEX IF NOT EXISTS idx_principles_workspace ON derived_principles(workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_principles_promotion_key ON derived_principles(workspace_id, promotion_key) WHERE promotion_key IS NOT NULL;

    -- ============================================
    -- NONCOMPLIANCE & DOC UPDATE TABLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS execution_noncompliance (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      violated_guidance_stage TEXT NOT NULL CHECK (violated_guidance_stage IN ('context-pack', 'spec')),
      violated_guidance_location TEXT NOT NULL,
      violated_guidance_excerpt TEXT NOT NULL,
      possible_causes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_noncompliance_workspace ON execution_noncompliance(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_noncompliance_project ON execution_noncompliance(project_id);
    CREATE INDEX IF NOT EXISTS idx_noncompliance_issue ON execution_noncompliance(issue_id);
    CREATE INDEX IF NOT EXISTS idx_noncompliance_created_at ON execution_noncompliance(created_at);

    CREATE TABLE IF NOT EXISTS doc_update_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      finding_category TEXT NOT NULL,
      scout_type TEXT NOT NULL,
      target_doc TEXT NOT NULL,
      update_type TEXT NOT NULL CHECK (update_type IN ('add_decision', 'clarify_guidance', 'fix_error', 'add_constraint')),
      decision_class TEXT,
      description TEXT NOT NULL,
      suggested_content TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
      completed_at TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_doc_updates_status ON doc_update_requests(status);
    CREATE INDEX IF NOT EXISTS idx_doc_updates_workspace ON doc_update_requests(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_doc_updates_project ON doc_update_requests(project_id);

    -- ============================================
    -- INJECTION & TRACKING TABLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS tagging_misses (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      pattern_id TEXT NOT NULL REFERENCES pattern_definitions(id),
      actual_task_profile TEXT NOT NULL,
      required_match TEXT NOT NULL,
      missing_tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
      resolution TEXT CHECK (resolution IS NULL OR resolution IN ('broadened_pattern', 'improved_extraction', 'false_positive')),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tagging_misses_status ON tagging_misses(status);
    CREATE INDEX IF NOT EXISTS idx_tagging_misses_pattern ON tagging_misses(pattern_id);

    CREATE TABLE IF NOT EXISTS injection_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      issue_id TEXT NOT NULL,
      target TEXT NOT NULL CHECK (target IN ('context-pack', 'spec')),
      injected_patterns TEXT NOT NULL DEFAULT '[]',
      injected_principles TEXT NOT NULL DEFAULT '[]',
      injected_alerts TEXT NOT NULL DEFAULT '[]',
      task_profile TEXT NOT NULL,
      injected_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_injection_logs_issue_id ON injection_logs(issue_id);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_workspace ON injection_logs(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_project ON injection_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_target ON injection_logs(target);

    -- ============================================
    -- PROVISIONAL ALERT & SALIENCE TABLES (v1.0)
    -- ============================================

    CREATE TABLE IF NOT EXISTS provisional_alerts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      message TEXT NOT NULL,
      touches TEXT NOT NULL DEFAULT '[]',
      inject_into TEXT NOT NULL CHECK (inject_into IN ('context-pack', 'spec', 'both')),
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'promoted')),
      promoted_to_pattern_id TEXT REFERENCES pattern_definitions(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_status ON provisional_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_expires_at ON provisional_alerts(expires_at);
    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_workspace ON provisional_alerts(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_project ON provisional_alerts(project_id);

    CREATE TABLE IF NOT EXISTS salience_issues (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      guidance_location_hash TEXT NOT NULL,
      guidance_stage TEXT NOT NULL CHECK (guidance_stage IN ('context-pack', 'spec')),
      guidance_location TEXT NOT NULL,
      guidance_excerpt TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      window_days INTEGER NOT NULL DEFAULT 30,
      noncompliance_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
      resolution TEXT CHECK (resolution IS NULL OR resolution IN ('reformatted', 'moved_earlier', 'false_positive')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_salience_issues_hash ON salience_issues(workspace_id, project_id, guidance_location_hash);
    CREATE INDEX IF NOT EXISTS idx_salience_issues_status ON salience_issues(status);

    -- ============================================
    -- KILL SWITCH TABLES (v1.0)
    -- ============================================

    CREATE TABLE IF NOT EXISTS kill_switch_status (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'inferred_paused', 'fully_paused')),
      reason TEXT,
      entered_at TEXT,
      auto_resume_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_kill_switch_scope
      ON kill_switch_status(workspace_id, project_id);

    CREATE TABLE IF NOT EXISTS attribution_outcomes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      issue_key TEXT NOT NULL,
      carrier_quote_type TEXT NOT NULL CHECK (carrier_quote_type IN ('verbatim', 'paraphrase', 'inferred')),
      pattern_created INTEGER NOT NULL DEFAULT 0,
      injection_occurred INTEGER NOT NULL DEFAULT 0,
      recurrence_observed INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attribution_outcomes_workspace ON attribution_outcomes(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_attribution_outcomes_project ON attribution_outcomes(project_id);
    CREATE INDEX IF NOT EXISTS idx_attribution_outcomes_created_at ON attribution_outcomes(created_at);
    CREATE INDEX IF NOT EXISTS idx_attribution_outcomes_issue_key ON attribution_outcomes(issue_key);
  `);
}
