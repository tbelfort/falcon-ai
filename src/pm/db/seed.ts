import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { IssueStage } from '../core/types.js';
import type { PresetConfig } from '../core/presets.js';
import { DEFAULT_PRESET_NAME } from '../core/presets.js';
import { getPmDb } from './connection.js';
import { labels, modelPresets, projects } from './schema.js';
import type * as schema from './schema.js';

const BUILTIN_LABELS = [
  'bug',
  'data',
  'docs',
  'foundation',
  'feature',
  'migration',
  'performance',
  'refactor',
  'security',
  'test',
  'ux',
] as const;

const FULL_PIPELINE_STAGES: IssueStage[] = [
  'BACKLOG',
  'TODO',
  'CONTEXT_PACK',
  'CONTEXT_REVIEW',
  'SPEC',
  'SPEC_REVIEW',
  'IMPLEMENT',
  'PR_REVIEW',
  'PR_HUMAN_REVIEW',
  'FIXER',
  'TESTING',
  'DOC_REVIEW',
  'MERGE_READY',
  'DONE',
];

const QUICK_FIX_STAGES: IssueStage[] = [
  'BACKLOG',
  'TODO',
  'CONTEXT_PACK',
  'CONTEXT_REVIEW',
  'IMPLEMENT',
  'PR_REVIEW',
  'PR_HUMAN_REVIEW',
  'TESTING',
  'DOC_REVIEW',
  'MERGE_READY',
  'DONE',
];

const DOCS_ONLY_STAGES: IssueStage[] = [
  'BACKLOG',
  'TODO',
  'CONTEXT_PACK',
  'CONTEXT_REVIEW',
  'IMPLEMENT',
  'PR_REVIEW',
  'PR_HUMAN_REVIEW',
  'TESTING',
  'DOC_REVIEW',
  'MERGE_READY',
  'DONE',
];

const FULL_PIPELINE_CONFIG: PresetConfig = {
  stages: FULL_PIPELINE_STAGES,
  models: {
    default: 'gpt-4o',
    overrides: {
      CONTEXT_PACK: 'gpt-4o-mini',
      SPEC: 'gpt-4o',
      IMPLEMENT: 'gpt-4o',
      PR_REVIEW: 'gpt-4o',
    },
  },
  prReview: {
    orchestrator: 'gpt-4o',
    scouts: ['gpt-4o-mini'],
    judge: 'gpt-4o',
  },
};

const QUICK_FIX_CONFIG: PresetConfig = {
  stages: QUICK_FIX_STAGES,
  models: {
    default: 'gpt-4o-mini',
  },
};

const DOCS_ONLY_CONFIG: PresetConfig = {
  stages: DOCS_ONLY_STAGES,
  models: {
    default: 'gpt-4o-mini',
  },
};

export function seedPmDb(
  db: BetterSQLite3Database<typeof schema> = getPmDb()
): BetterSQLite3Database<typeof schema> {
  const projectRows = db.select({ id: projects.id }).from(projects).all();

  for (const project of projectRows) {
    const labelValues = BUILTIN_LABELS.map((name) => ({
      projectId: project.id,
      name,
      isBuiltin: true,
    }));
    if (labelValues.length > 0) {
      db.insert(labels)
        .values(labelValues)
        .onConflictDoNothing({ target: [labels.projectId, labels.name] })
        .run();
    }
  }

  const presetValues = [
    {
      name: DEFAULT_PRESET_NAME,
      description: 'Default full pipeline',
      config: JSON.stringify(FULL_PIPELINE_CONFIG),
      isDefault: true,
      forLabel: null,
    },
    {
      name: 'quick-fix',
      description: 'Fast path for small fixes',
      config: JSON.stringify(QUICK_FIX_CONFIG),
      isDefault: false,
      forLabel: null,
    },
    {
      name: 'docs-only',
      description: 'Documentation-only workflow',
      config: JSON.stringify(DOCS_ONLY_CONFIG),
      isDefault: false,
      forLabel: 'docs',
    },
  ];

  db.insert(modelPresets)
    .values(presetValues)
    .onConflictDoNothing({ target: modelPresets.name })
    .run();

  return db;
}
