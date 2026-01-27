import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { IssueDto, IssueStage } from '@/api/types';
import { getStageLabel } from '@/utils/stages';
import { IssueCard } from './IssueCard';

interface IssueColumnProps {
  stage: IssueStage;
  issues: IssueDto[];
  onSelectIssue: (issueId: string) => void;
}

export function IssueColumn({ stage, issues, onSelectIssue }: IssueColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const issueIds = issues.map((issue) => issue.id);

  return (
    <section
      ref={setNodeRef}
      className={`glass flex h-full w-72 flex-col gap-4 rounded-3xl p-4 transition ${
        isOver ? 'ring-2 ring-teal-500' : 'ring-1 ring-transparent'
      }`}
      data-testid={`column-${stage}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-steel">Stage</p>
          <h2 className="text-lg font-semibold text-ink">{getStageLabel(stage)}</h2>
        </div>
        <span className="rounded-full bg-[var(--teal-soft)] px-3 py-1 text-xs font-semibold text-[var(--teal)]">
          {issues.length}
        </span>
      </div>

      <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-3">
          {issues.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[rgba(27,27,22,0.2)] p-4 text-xs text-steel">
              Drop an issue here
            </div>
          )}
          {issues.map((issue, index) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onSelect={onSelectIssue}
              index={index}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
