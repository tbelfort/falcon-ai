import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { IssueDto, IssueStage } from '../types';
import { IssueCard } from './IssueCard';

interface KanbanColumnProps {
  stage: IssueStage;
  issues: IssueDto[];
  onIssueClick: (issueId: string) => void;
}

const STAGE_LABELS: Record<IssueStage, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To Do',
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

const STAGE_COLORS: Record<IssueStage, string> = {
  BACKLOG: 'bg-gray-100',
  TODO: 'bg-yellow-50',
  CONTEXT_PACK: 'bg-purple-50',
  CONTEXT_REVIEW: 'bg-purple-100',
  SPEC: 'bg-blue-50',
  SPEC_REVIEW: 'bg-blue-100',
  IMPLEMENT: 'bg-green-50',
  PR_REVIEW: 'bg-orange-50',
  PR_HUMAN_REVIEW: 'bg-orange-100',
  FIXER: 'bg-red-50',
  TESTING: 'bg-cyan-50',
  DOC_REVIEW: 'bg-indigo-50',
  MERGE_READY: 'bg-emerald-100',
  DONE: 'bg-green-100',
};

export function KanbanColumn({ stage, issues, onIssueClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
  });

  const issueIds = issues.map((i) => i.id);

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 flex flex-col rounded-lg ${STAGE_COLORS[stage]} ${
        isOver ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{STAGE_LABELS[stage]}</h3>
          <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full">
            {issues.length}
          </span>
        </div>
      </div>

      <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto">
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onClick={() => onIssueClick(issue.id)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
