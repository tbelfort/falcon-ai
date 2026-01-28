import { describe, expect, it } from 'vitest';
import type { IssueStage, ModelPreset } from '../../../src/pm/core/types.js';
import type { PresetConfig } from '../../../src/pm/core/presets.js';
import {
  parsePresetConfig,
  resolvePreset,
  resolveStageModel,
  nextStageForPreset,
} from '../../../src/pm/orchestrator/preset-resolver.js';

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

function createPreset(overrides?: Partial<ModelPreset>): ModelPreset {
  const config: PresetConfig = {
    stages: FULL_PIPELINE_STAGES,
    models: { default: 'gpt-4o' },
  };

  return {
    id: 'preset-1',
    name: 'full-pipeline',
    description: null,
    config: JSON.stringify(config),
    isDefault: false,
    forLabel: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('parsePresetConfig', () => {
  it('parses valid JSON config', () => {
    const config: PresetConfig = {
      stages: FULL_PIPELINE_STAGES,
      models: { default: 'gpt-4o' },
    };

    const parsed = parsePresetConfig(JSON.stringify(config));
    expect(parsed?.stages).toEqual(FULL_PIPELINE_STAGES);
    expect(parsed?.models.default).toBe('gpt-4o');
  });

  it('returns null for empty string input', () => {
    expect(parsePresetConfig('')).toBeNull();
  });

  it('returns null for invalid JSON string', () => {
    expect(parsePresetConfig('{ invalid json')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parsePresetConfig('"just a string"')).toBeNull();
    expect(parsePresetConfig('123')).toBeNull();
    expect(parsePresetConfig('null')).toBeNull();
  });

  it('returns null when stages is not an array', () => {
    expect(parsePresetConfig('{"stages": "not-array", "models": {"default": "gpt-4o"}}')).toBeNull();
  });

  it('returns null when stages is missing', () => {
    expect(parsePresetConfig('{"models": {"default": "gpt-4o"}}')).toBeNull();
  });

  it('returns null when models is missing', () => {
    expect(parsePresetConfig('{"stages": []}')).toBeNull();
  });

  it('returns null when models.default is not a string', () => {
    expect(parsePresetConfig('{"stages": [], "models": {"default": 123}}')).toBeNull();
  });

  it('returns null when models.default is missing', () => {
    expect(parsePresetConfig('{"stages": [], "models": {}}')).toBeNull();
  });

  it('accepts config with overrides', () => {
    const config: PresetConfig = {
      stages: ['TODO', 'IMPLEMENT'],
      models: {
        default: 'gpt-4o',
        overrides: { IMPLEMENT: 'claude-3-opus' },
      },
    };

    const parsed = parsePresetConfig(JSON.stringify(config));
    expect(parsed?.models.overrides?.IMPLEMENT).toBe('claude-3-opus');
  });
});

describe('resolveStageModel', () => {
  it('returns override when present', () => {
    const config: PresetConfig = {
      stages: FULL_PIPELINE_STAGES,
      models: {
        default: 'gpt-4o',
        overrides: { SPEC: 'gpt-4o-mini' },
      },
    };

    expect(resolveStageModel(config, 'SPEC')).toBe('gpt-4o-mini');
  });

  it('returns default when no override', () => {
    const config: PresetConfig = {
      stages: FULL_PIPELINE_STAGES,
      models: {
        default: 'gpt-4o',
        overrides: { SPEC: 'gpt-4o-mini' },
      },
    };

    expect(resolveStageModel(config, 'IMPLEMENT')).toBe('gpt-4o');
  });

  it('returns default when overrides is undefined', () => {
    const config: PresetConfig = {
      stages: FULL_PIPELINE_STAGES,
      models: { default: 'gpt-4o' },
    };

    expect(resolveStageModel(config, 'IMPLEMENT')).toBe('gpt-4o');
  });
});

describe('resolvePreset', () => {
  it('resolves by issue.presetId', () => {
    const preset = createPreset({ id: 'preset-abc', name: 'custom' });
    const result = resolvePreset({ presetId: 'preset-abc' }, [preset]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preset.id).toBe('preset-abc');
    }
  });

  it('falls back to isDefault preset', () => {
    const defaultPreset = createPreset({ id: 'default-preset', isDefault: true });
    const otherPreset = createPreset({ id: 'other-preset' });
    const result = resolvePreset({ presetId: null }, [otherPreset, defaultPreset]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preset.id).toBe('default-preset');
    }
  });

  it('falls back to full-pipeline name', () => {
    const preset = createPreset({ id: 'fp-id', name: 'full-pipeline', isDefault: false });
    const result = resolvePreset({ presetId: null }, [preset]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preset.name).toBe('full-pipeline');
    }
  });

  it('respects custom fallback name option', () => {
    const preset = createPreset({ id: 'custom-id', name: 'custom-fallback', isDefault: false });
    const result = resolvePreset({ presetId: null }, [preset], { defaultName: 'custom-fallback' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preset.name).toBe('custom-fallback');
    }
  });

  it('returns error when no preset found', () => {
    const result = resolvePreset({ presetId: 'nonexistent' }, []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Preset not found for issue');
    }
  });

  it('returns error when preset config is invalid', () => {
    const badPreset: ModelPreset = {
      id: 'bad-preset',
      name: 'bad',
      description: null,
      config: 'invalid json',
      isDefault: true,
      forLabel: null,
      createdAt: 0,
      updatedAt: 0,
    };

    const result = resolvePreset({ presetId: null }, [badPreset]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid preset config');
    }
  });

  it('prefers presetId over isDefault', () => {
    const explicitPreset = createPreset({ id: 'explicit', isDefault: false });
    const defaultPreset = createPreset({ id: 'default', isDefault: true });
    const result = resolvePreset({ presetId: 'explicit' }, [explicitPreset, defaultPreset]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preset.id).toBe('explicit');
    }
  });
});

describe('nextStageForPreset', () => {
  it('returns next stage in sequence', () => {
    expect(nextStageForPreset('TODO', FULL_PIPELINE_STAGES)).toBe('CONTEXT_PACK');
    expect(nextStageForPreset('CONTEXT_PACK', FULL_PIPELINE_STAGES)).toBe('CONTEXT_REVIEW');
    expect(nextStageForPreset('MERGE_READY', FULL_PIPELINE_STAGES)).toBe('DONE');
  });

  it('returns null for last stage', () => {
    expect(nextStageForPreset('DONE', FULL_PIPELINE_STAGES)).toBeNull();
  });

  it('returns null for stage not in list', () => {
    expect(nextStageForPreset('UNKNOWN' as IssueStage, FULL_PIPELINE_STAGES)).toBeNull();
  });

  it('handles subset stage lists', () => {
    const subset: IssueStage[] = ['TODO', 'IMPLEMENT', 'DONE'];
    expect(nextStageForPreset('TODO', subset)).toBe('IMPLEMENT');
    expect(nextStageForPreset('IMPLEMENT', subset)).toBe('DONE');
    expect(nextStageForPreset('DONE', subset)).toBeNull();
  });
});
