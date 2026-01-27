import type { IssueStage } from '@/api/types';

export const STAGE_ORDER: IssueStage[] = [
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

const LABELS: Record<IssueStage, string> = {
  BACKLOG: 'Backlog',
  TODO: 'Todo',
  CONTEXT_PACK: 'Context Pack',
  CONTEXT_REVIEW: 'Context Review',
  SPEC: 'Spec',
  SPEC_REVIEW: 'Spec Review',
  IMPLEMENT: 'Implement',
  PR_REVIEW: 'PR Review',
  PR_HUMAN_REVIEW: 'PR Human Review',
  FIXER: 'Fixer',
  TESTING: 'Testing',
  DOC_REVIEW: 'Doc Review',
  MERGE_READY: 'Merge Ready',
  DONE: 'Done',
};

const TONES: Record<IssueStage, { bg: string; text: string }> = {
  BACKLOG: { bg: '#efe3cd', text: '#5b3b2a' },
  TODO: { bg: '#d9ede8', text: '#1f6f64' },
  CONTEXT_PACK: { bg: '#e4edf6', text: '#2b4a66' },
  CONTEXT_REVIEW: { bg: '#d8e4f0', text: '#2b4a66' },
  SPEC: { bg: '#f5e6d8', text: '#7a3d21' },
  SPEC_REVIEW: { bg: '#f1dcc9', text: '#7a3d21' },
  IMPLEMENT: { bg: '#e7f0e6', text: '#2d5a2c' },
  PR_REVIEW: { bg: '#f7e6e6', text: '#8c3a2b' },
  PR_HUMAN_REVIEW: { bg: '#f2d9d9', text: '#8c3a2b' },
  FIXER: { bg: '#f2e1d1', text: '#6a3b1f' },
  TESTING: { bg: '#e7edf5', text: '#254366' },
  DOC_REVIEW: { bg: '#efe9dc', text: '#5a4a2c' },
  MERGE_READY: { bg: '#dff0e8', text: '#205840' },
  DONE: { bg: '#dfead5', text: '#2f5a25' },
};

export function getStageLabel(stage: IssueStage): string {
  return LABELS[stage];
}

export function getStageTone(stage: IssueStage): { bg: string; text: string } {
  return TONES[stage];
}
