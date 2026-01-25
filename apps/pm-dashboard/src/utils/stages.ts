import { IssueStage } from '../api/types';

export const ISSUE_STAGES: IssueStage[] = [
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
  'DONE'
];

const STAGE_LABELS: Record<IssueStage, string> = {
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
  DONE: 'Done'
};

const STAGE_COLORS: Record<IssueStage, string> = {
  BACKLOG: '#94A3B8',
  TODO: '#38BDF8',
  CONTEXT_PACK: '#22C55E',
  CONTEXT_REVIEW: '#34D399',
  SPEC: '#F97316',
  SPEC_REVIEW: '#FB923C',
  IMPLEMENT: '#FACC15',
  PR_REVIEW: '#F87171',
  PR_HUMAN_REVIEW: '#FB7185',
  FIXER: '#F472B6',
  TESTING: '#60A5FA',
  DOC_REVIEW: '#2DD4BF',
  MERGE_READY: '#10B981',
  DONE: '#16A34A'
};

export function getStageLabel(stage: IssueStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function getStageColor(stage: IssueStage): string {
  return STAGE_COLORS[stage] ?? '#94A3B8';
}
