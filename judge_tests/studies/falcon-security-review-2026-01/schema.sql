-- Schema for judge tests study database

-- Source files being analyzed
CREATE TABLE IF NOT EXISTS source_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE NOT NULL,
    filepath TEXT NOT NULL
);

-- Agent definitions (model + role combinations)
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL,  -- haiku, sonnet, opus
    role TEXT NOT NULL,   -- scout, judge, high_judge
    UNIQUE(model, role)
);

-- Test series metadata
CREATE TABLE IF NOT EXISTS test_series (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,  -- flat, hierarchical, volume, accumulation, saturation
    description TEXT,
    scout_model TEXT,
    judge_model TEXT,
    high_judge_model TEXT,
    scout_count INTEGER DEFAULT 6,
    judge_count INTEGER DEFAULT 6,
    has_dual_pipeline INTEGER DEFAULT 0,
    has_accumulation INTEGER DEFAULT 0,
    execution_mode TEXT  -- batch, sequential, or NULL
);

-- Individual test runs
CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT REFERENCES test_series(id),
    run_number INTEGER,
    execution_mode TEXT,  -- batch, sequential, or NULL
    output_file TEXT NOT NULL,
    UNIQUE(series_id, run_number, execution_mode)
);

-- Agent instances (specific agent invocations in a test run)
CREATE TABLE IF NOT EXISTS agent_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_run_id INTEGER REFERENCES test_runs(id) NOT NULL,
    agent_id INTEGER REFERENCES agents(id) NOT NULL,
    pipeline TEXT,  -- primary, secondary, or NULL
    sequence_number INTEGER
);

-- Findings (unique issues found)
CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    finding_id TEXT NOT NULL,  -- e.g., SEC-001, H-LOG-002, FINAL-001
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT,  -- CRITICAL, HIGH, MEDIUM, LOW, INFO
    category TEXT,  -- security, logic, documentation, etc.
    source_file_id INTEGER REFERENCES source_files(id),
    line_start INTEGER,
    line_end INTEGER
);

-- Scout findings (links agent instances to findings)
CREATE TABLE IF NOT EXISTS scout_findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_instance_id INTEGER REFERENCES agent_instances(id) NOT NULL,
    finding_id INTEGER REFERENCES findings(id) NOT NULL,
    raw_severity TEXT
);

-- Judge confirmations (verdicts on scout findings)
CREATE TABLE IF NOT EXISTS judge_confirmations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_instance_id INTEGER REFERENCES agent_instances(id) NOT NULL,
    scout_finding_id INTEGER REFERENCES scout_findings(id) NOT NULL,
    verdict TEXT NOT NULL,  -- confirmed, rejected, modified
    adjusted_severity TEXT,
    rationale TEXT
);

-- High judge verdicts (final verdicts from high judge)
CREATE TABLE IF NOT EXISTS high_judge_verdicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_instance_id INTEGER REFERENCES agent_instances(id) NOT NULL,
    finding_id INTEGER REFERENCES findings(id) NOT NULL,
    final_severity TEXT,
    verdict TEXT,
    rationale TEXT,
    recommendation TEXT
);

-- Finding merges (deduplication in E series)
CREATE TABLE IF NOT EXISTS finding_merges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merged_finding_id TEXT NOT NULL,  -- e.g., FINAL-001
    canonical_title TEXT,
    canonical_severity TEXT
);

-- Finding merge members (original findings that were merged)
CREATE TABLE IF NOT EXISTS finding_merge_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    finding_merge_id INTEGER REFERENCES finding_merges(id) NOT NULL,
    finding_id INTEGER REFERENCES findings(id) NOT NULL,
    UNIQUE(finding_merge_id, finding_id)
);

-- Create indices for common queries
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_scout_findings_agent ON scout_findings(agent_instance_id);
CREATE INDEX IF NOT EXISTS idx_judge_confirmations_verdict ON judge_confirmations(verdict);
CREATE INDEX IF NOT EXISTS idx_agent_instances_test_run ON agent_instances(test_run_id);
