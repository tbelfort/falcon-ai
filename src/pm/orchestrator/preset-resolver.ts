import type { IssueStage, ModelPreset } from '../core/types.js';
import type { PresetConfig } from '../core/presets.js';
import { DEFAULT_PRESET_NAME } from '../core/presets.js';

export interface PresetResolution {
  preset: ModelPreset;
  config: PresetConfig;
}

export type PresetResolutionResult =
  | { ok: true; value: PresetResolution }
  | { ok: false; error: string };

export function parsePresetConfig(raw: ModelPreset['config']): PresetConfig | null {
  if (!raw) {
    return null;
  }

  const parsed = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as PresetConfig;
  if (!Array.isArray(candidate.stages)) {
    return null;
  }
  if (!candidate.models || typeof candidate.models.default !== 'string') {
    return null;
  }

  return candidate;
}

export function resolvePreset(
  issue: { presetId: string | null },
  presets: ModelPreset[],
  options?: { defaultName?: string }
): PresetResolutionResult {
  const fallbackName = options?.defaultName ?? DEFAULT_PRESET_NAME;
  let preset: ModelPreset | undefined;

  if (issue.presetId) {
    preset = presets.find((item) => item.id === issue.presetId);
  }

  if (!preset) {
    preset = presets.find((item) => item.isDefault);
  }

  if (!preset) {
    preset = presets.find((item) => item.name === fallbackName);
  }

  if (!preset) {
    return { ok: false, error: 'Preset not found for issue' };
  }

  const config = parsePresetConfig(preset.config);
  if (!config) {
    return { ok: false, error: `Invalid preset config for ${preset.name}` };
  }

  return { ok: true, value: { preset, config } };
}

export function resolveStageModel(config: PresetConfig, stage: IssueStage): string {
  return config.models.overrides?.[stage] ?? config.models.default;
}

export function nextStageForPreset(
  current: IssueStage,
  stages: IssueStage[]
): IssueStage | null {
  const index = stages.indexOf(current);
  if (index === -1) {
    return null;
  }
  return stages[index + 1] ?? null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
