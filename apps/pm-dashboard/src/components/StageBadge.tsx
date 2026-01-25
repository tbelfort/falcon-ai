import type { IssueStage } from '../types';
import { STAGE_LABELS } from '../utils/stages';

interface StageBadgeProps {
  stage: IssueStage;
}

const stageStyles: Record<IssueStage, string> = {
  BACKLOG: 'bg-stone-200 text-stone-700',
  TODO: 'bg-sky-200 text-sky-800',
  CONTEXT_PACK: 'bg-amber-200 text-amber-800',
  CONTEXT_REVIEW: 'bg-amber-300 text-amber-900',
  SPEC: 'bg-indigo-200 text-indigo-800',
  SPEC_REVIEW: 'bg-indigo-300 text-indigo-900',
  IMPLEMENT: 'bg-emerald-200 text-emerald-800',
  PR_REVIEW: 'bg-emerald-300 text-emerald-900',
  PR_HUMAN_REVIEW: 'bg-emerald-400 text-emerald-950',
  FIXER: 'bg-rose-200 text-rose-800',
  TESTING: 'bg-lime-200 text-lime-800',
  DOC_REVIEW: 'bg-yellow-200 text-yellow-900',
  MERGE_READY: 'bg-teal-200 text-teal-900',
  DONE: 'bg-stone-300 text-stone-900'
};

export function StageBadge({ stage }: StageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        stageStyles[stage]
      }`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
