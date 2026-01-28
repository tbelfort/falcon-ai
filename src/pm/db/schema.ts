import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    repoUrl: text('repo_url'),
    defaultBranch: text('default_branch').notNull().default('main'),
    config: text('config'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [uniqueIndex('projects_slug_idx').on(table.slug)]
);

export const issues = sqliteTable(
  'issues',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('backlog'),
    stage: text('stage').notNull().default('BACKLOG'),
    priority: text('priority').default('medium'),
    presetId: text('preset_id'),
    branchName: text('branch_name'),
    prNumber: integer('pr_number'),
    prUrl: text('pr_url'),
    assignedAgentId: text('assigned_agent_id'),
    assignedHuman: text('assigned_human'),
    attributes: text('attributes'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
  },
  (table) => [
    unique().on(table.projectId, table.number),
    index('issues_project_idx').on(table.projectId),
    index('issues_status_idx').on(table.status),
    index('issues_stage_idx').on(table.stage),
    index('issues_agent_idx').on(table.assignedAgentId),
    index('issues_preset_idx').on(table.presetId),
  ]
);

export const labels = sqliteTable(
  'labels',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6b7280'),
    description: text('description'),
    isBuiltin: integer('is_builtin', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    unique().on(table.projectId, table.name),
    index('labels_project_idx').on(table.projectId),
  ]
);

export const issueLabels = sqliteTable(
  'issue_labels',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.labelId] }),
    index('issue_labels_issue_idx').on(table.issueId),
    index('issue_labels_label_idx').on(table.labelId),
  ]
);

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    agentType: text('agent_type').notNull(),
    model: text('model').notNull(),
    status: text('status').notNull().default('idle'),
    currentIssueId: text('current_issue_id'),
    currentStage: text('current_stage'),
    workDir: text('work_dir').notNull(),
    config: text('config'),
    totalTasksCompleted: integer('total_tasks_completed')
      .notNull()
      .default(0),
    lastActiveAt: integer('last_active_at'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    unique().on(table.projectId, table.name),
    index('agents_project_idx').on(table.projectId),
    index('agents_status_idx').on(table.status),
  ]
);

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    issueId: text('issue_id').references(() => issues.id),
    title: text('title').notNull(),
    docType: text('doc_type').notNull(),
    filePath: text('file_path').notNull(),
    contentHash: text('content_hash'),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('documents_project_idx').on(table.projectId),
    index('documents_issue_idx').on(table.issueId),
    index('documents_type_idx').on(table.docType),
  ]
);

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    authorType: text('author_type').notNull(),
    authorName: text('author_name').notNull(),
    parentId: text('parent_id'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('comments_issue_idx').on(table.issueId),
    index('comments_author_idx').on(table.authorName),
  ]
);

export const stageMessages = sqliteTable(
  'stage_messages',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    fromStage: text('from_stage').notNull(),
    toStage: text('to_stage').notNull(),
    fromAgent: text('from_agent').notNull(),
    message: text('message').notNull(),
    priority: text('priority').default('normal'),
    readAt: integer('read_at'),
    readBy: text('read_by'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('stage_messages_issue_idx').on(table.issueId),
    index('stage_messages_to_stage_idx').on(table.toStage),
    index('stage_messages_unread_idx').on(
      table.issueId,
      table.toStage,
      table.readAt
    ),
  ]
);

export const modelPresets = sqliteTable(
  'model_presets',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    name: text('name').notNull(),
    description: text('description'),
    config: text('config').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' })
      .notNull()
      .default(false),
    forLabel: text('for_label'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex('model_presets_name_idx').on(table.name),
    index('model_presets_label_idx').on(table.forLabel),
  ]
);

export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    stage: text('stage').notNull(),
    presetId: text('preset_id').references(() => modelPresets.id),
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull().default(sql`(unixepoch())`),
    completedAt: integer('completed_at'),
    resultSummary: text('result_summary'),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
    costUsd: real('cost_usd'),
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    sessionId: text('session_id'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('workflow_runs_issue_idx').on(table.issueId),
    index('workflow_runs_agent_idx').on(table.agentId),
    index('workflow_runs_status_idx').on(table.status),
  ]
);

export const prFindings = sqliteTable(
  'pr_findings',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    prNumber: integer('pr_number').notNull(),
    findingType: text('finding_type').notNull(),
    category: text('category'),
    filePath: text('file_path'),
    lineNumber: integer('line_number'),
    message: text('message').notNull(),
    suggestion: text('suggestion'),
    foundBy: text('found_by').notNull(),
    confirmedBy: text('confirmed_by'),
    confidence: real('confidence'),
    status: text('status').notNull().default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewComment: text('review_comment'),
    reviewedAt: integer('reviewed_at'),
    fixed: integer('fixed', { mode: 'boolean' }).notNull().default(false),
    fixedInCommit: text('fixed_in_commit'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('pr_findings_issue_idx').on(table.issueId),
    index('pr_findings_status_idx').on(table.status),
  ]
);
