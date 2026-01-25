import { useDroppable } from '@dnd-kit/core';
import type { IssueDto, IssueStage } from '../types';
import { StageBadge } from './StageBadge';
import { IssueCard } from './IssueCard';

interface KanbanColumnProps {
  stage: IssueStage;
  title: string;
  issues: IssueDto[];
  onOpenIssue: (issueId: string) => void;
}

export function KanbanColumn({ stage, title, issues, onOpenIssue }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage
  });

  return (
    <section
      ref={setNodeRef}
      data-testid={`stage-column-${stage}`}
      className={`flex min-h-[400px] w-72 flex-col gap-3 rounded-3xl border border-dashed p-4 transition ${
        isOver ? 'border-orange-400 bg-orange-50/70' : 'border-amber-200/60 bg-white/60'
      }`}
    >
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
          <span className="text-xs text-slate-500">{issues.length} issues</span>
        </div>
        <StageBadge stage={stage} />
      </header>
      <div className="flex flex-col gap-3">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} onOpen={onOpenIssue} />
        ))}
      </div>
    </section>
  );
}
