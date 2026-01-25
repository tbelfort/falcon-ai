import type { IssueStage } from '../api/types';
import { formatStage } from '../utils/format';

const TONE_BY_STAGE: Record<IssueStage, string> = {
  BACKLOG: 'bg-slate-100 text-slate-600',
  TODO: 'bg-sky-100 text-sky-700',
  CONTEXT_PACK: 'bg-indigo-100 text-indigo-700',
  CONTEXT_REVIEW: 'bg-indigo-100 text-indigo-700',
  SPEC: 'bg-amber-100 text-amber-700',
  SPEC_REVIEW: 'bg-amber-100 text-amber-700',
  IMPLEMENT: 'bg-emerald-100 text-emerald-700',
  PR_REVIEW: 'bg-rose-100 text-rose-700',
  PR_HUMAN_REVIEW: 'bg-rose-100 text-rose-700',
  FIXER: 'bg-orange-100 text-orange-700',
  TESTING: 'bg-cyan-100 text-cyan-700',
  DOC_REVIEW: 'bg-purple-100 text-purple-700',
  MERGE_READY: 'bg-lime-100 text-lime-700',
  DONE: 'bg-green-100 text-green-700',
};

interface StageBadgeProps {
  stage: IssueStage;
}

export function StageBadge({ stage }: StageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${
        TONE_BY_STAGE[stage]
      }`}
    >
      {formatStage(stage)}
    </span>
  );
}
