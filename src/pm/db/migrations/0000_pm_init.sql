CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  repo_url TEXT,
  default_branch TEXT DEFAULT 'main',
  config TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX projects_slug_idx ON projects(slug);
--> statement-breakpoint
CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  stage TEXT NOT NULL DEFAULT 'BACKLOG',
  priority TEXT DEFAULT 'medium',
  preset_id TEXT REFERENCES model_presets(id),
  branch_name TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  assigned_agent_id TEXT REFERENCES agents(id),
  assigned_human TEXT,
  attributes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  UNIQUE(project_id, number)
);
--> statement-breakpoint
CREATE INDEX issues_project_idx ON issues(project_id);
--> statement-breakpoint
CREATE INDEX issues_status_idx ON issues(status);
--> statement-breakpoint
CREATE INDEX issues_stage_idx ON issues(stage);
--> statement-breakpoint
CREATE INDEX issues_agent_idx ON issues(assigned_agent_id);
--> statement-breakpoint
CREATE INDEX issues_preset_idx ON issues(preset_id);
--> statement-breakpoint
CREATE TABLE labels (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  description TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project_id, name)
);
--> statement-breakpoint
CREATE INDEX labels_project_idx ON labels(project_id);
--> statement-breakpoint
CREATE TABLE issue_labels (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (issue_id, label_id)
);
--> statement-breakpoint
CREATE INDEX issue_labels_issue_idx ON issue_labels(issue_id);
--> statement-breakpoint
CREATE INDEX issue_labels_label_idx ON issue_labels(label_id);
--> statement-breakpoint
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  current_issue_id TEXT REFERENCES issues(id),
  current_stage TEXT,
  work_dir TEXT NOT NULL,
  config TEXT,
  total_tasks_completed INTEGER NOT NULL DEFAULT 0,
  last_active_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project_id, name)
);
--> statement-breakpoint
CREATE INDEX agents_project_idx ON agents(project_id);
--> statement-breakpoint
CREATE INDEX agents_status_idx ON agents(status);
--> statement-breakpoint
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  issue_id TEXT REFERENCES issues(id),
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX documents_project_idx ON documents(project_id);
--> statement-breakpoint
CREATE INDEX documents_issue_idx ON documents(issue_id);
--> statement-breakpoint
CREATE INDEX documents_type_idx ON documents(doc_type);
--> statement-breakpoint
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  parent_id TEXT REFERENCES comments(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX comments_issue_idx ON comments(issue_id);
--> statement-breakpoint
CREATE INDEX comments_author_idx ON comments(author_name);
--> statement-breakpoint
CREATE TABLE stage_messages (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  read_at INTEGER,
  read_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX stage_messages_issue_idx ON stage_messages(issue_id);
--> statement-breakpoint
CREATE INDEX stage_messages_to_stage_idx ON stage_messages(to_stage);
--> statement-breakpoint
CREATE INDEX stage_messages_unread_idx ON stage_messages(issue_id, to_stage, read_at);
--> statement-breakpoint
CREATE TABLE model_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  config TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  for_label TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX model_presets_name_idx ON model_presets(name);
--> statement-breakpoint
CREATE INDEX model_presets_label_idx ON model_presets(for_label);
--> statement-breakpoint
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  stage TEXT NOT NULL,
  preset_id TEXT REFERENCES model_presets(id),
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  result_summary TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  cost_usd REAL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  session_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX workflow_runs_issue_idx ON workflow_runs(issue_id);
--> statement-breakpoint
CREATE INDEX workflow_runs_agent_idx ON workflow_runs(agent_id);
--> statement-breakpoint
CREATE INDEX workflow_runs_status_idx ON workflow_runs(status);
--> statement-breakpoint
CREATE TABLE pr_findings (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL,
  finding_type TEXT NOT NULL,
  category TEXT,
  file_path TEXT,
  line_number INTEGER,
  message TEXT NOT NULL,
  suggestion TEXT,
  found_by TEXT NOT NULL,
  confirmed_by TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  review_comment TEXT,
  reviewed_at INTEGER,
  fixed INTEGER NOT NULL DEFAULT 0,
  fixed_in_commit TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX pr_findings_issue_idx ON pr_findings(issue_id);
--> statement-breakpoint
CREATE INDEX pr_findings_status_idx ON pr_findings(status);
