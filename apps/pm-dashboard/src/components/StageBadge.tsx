import type { IssueStage } from '../api/types';
import { stageLabels } from '../constants/stages';

interface StageBadgeProps {
  stage: IssueStage;
}

const stageTone: Record<IssueStage, string> = {
  BACKLOG: 'bg-ink-100 text-ink-700',
  TODO: 'bg-ink-200 text-ink-800',
  CONTEXT_PACK: 'bg-amber-100 text-amber-700',
  CONTEXT_REVIEW: 'bg-amber-200 text-amber-800',
  SPEC: 'bg-sky-100 text-sky-700',
  SPEC_REVIEW: 'bg-sky-200 text-sky-800',
  IMPLEMENT: 'bg-emerald-100 text-emerald-700',
  PR_REVIEW: 'bg-violet-100 text-violet-700',
  PR_HUMAN_REVIEW: 'bg-violet-200 text-violet-800',
  FIXER: 'bg-rose-100 text-rose-700',
  TESTING: 'bg-cyan-100 text-cyan-700',
  DOC_REVIEW: 'bg-indigo-100 text-indigo-700',
  MERGE_READY: 'bg-lime-100 text-lime-700',
  DONE: 'bg-emerald-200 text-emerald-800'
};

export function StageBadge({ stage }: StageBadgeProps) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stageTone[stage]}`}>
      {stageLabels[stage]}
    </span>
  );
}
