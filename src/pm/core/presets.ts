import type { IssueStage } from './types.js';

export interface PresetConfig {
  stages: IssueStage[];
  models: {
    default: string;
    overrides?: Partial<Record<IssueStage, string>>;
  };
  prReview?: {
    orchestrator: string;
    scouts: string[];
    judge: string;
  };
}

export const DEFAULT_PRESET_NAME = 'full-pipeline' as const;
