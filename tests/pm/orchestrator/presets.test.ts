import { describe, expect, it } from 'vitest';
import type { IssueStage, ModelPreset } from '../../../src/pm/core/types.js';
import type { PresetConfig } from '../../../src/pm/core/presets.js';
import { parsePresetConfig, resolveStageModel } from '../../../src/pm/orchestrator/preset-resolver.js';

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

describe('preset resolver', () => {
  it('keeps stage lists stable', () => {
    const config: PresetConfig = {
      stages: FULL_PIPELINE_STAGES,
      models: {
        default: 'gpt-4o',
      },
    };

    const preset: ModelPreset = {
      id: 'preset-1',
      name: 'full-pipeline',
      description: null,
      config: JSON.stringify(config),
      isDefault: true,
      forLabel: null,
      createdAt: 0,
      updatedAt: 0,
    };

    const parsed = parsePresetConfig(preset.config);
    expect(parsed?.stages).toEqual(FULL_PIPELINE_STAGES);
  });

  it('resolves per-stage overrides', () => {
    const config: PresetConfig = {
      stages: FULL_PIPELINE_STAGES,
      models: {
        default: 'gpt-4o',
        overrides: {
          SPEC: 'gpt-4o-mini',
        },
      },
    };

    expect(resolveStageModel(config, 'SPEC')).toBe('gpt-4o-mini');
    expect(resolveStageModel(config, 'IMPLEMENT')).toBe('gpt-4o');
  });
});
