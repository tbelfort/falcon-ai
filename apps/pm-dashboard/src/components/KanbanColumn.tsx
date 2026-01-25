import { useDroppable } from '@dnd-kit/core';
import type { IssueDto, IssueStage } from '../api/types';
import { stageLabels } from '../constants/stages';
import { IssueCard } from './IssueCard';

interface KanbanColumnProps {
  stage: IssueStage;
  issues: IssueDto[];
  onIssueOpen: (issueId: string) => void;
}

export function KanbanColumn({ stage, issues, onIssueOpen }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${stage}`}
      className={`flex h-full min-w-[260px] flex-1 flex-col gap-3 rounded-3xl border border-ink-100/60 bg-white/60 p-4 shadow-sm transition ${
        isOver ? 'ring-2 ring-coral-400/60' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-800">{stageLabels[stage]}</p>
          <p className="text-xs text-ink-500">{issues.length} issues</p>
        </div>
        <span className="rounded-full bg-ink-100 px-2 py-1 text-xs font-semibold text-ink-700">
          {stage}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {issues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-100 bg-white/70 p-4 text-xs text-ink-400">
            Drop issues here
          </div>
        ) : null}
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} onOpen={onIssueOpen} />
        ))}
      </div>
    </div>
  );
}
