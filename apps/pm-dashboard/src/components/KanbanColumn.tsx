import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { IssueDto, IssueStage } from '../types';
import { IssueCard } from './IssueCard';

interface KanbanColumnProps {
  stage: IssueStage;
  issues: IssueDto[];
  onIssueClick: (id: string) => void;
}

const STAGE_LABELS: Record<IssueStage, string> = {
  BACKLOG: 'Backlog',
  TODO: 'Todo',
  CONTEXT_PACK: 'Context Pack',
  CONTEXT_REVIEW: 'Context Review',
  SPEC: 'Spec',
  SPEC_REVIEW: 'Spec Review',
  IMPLEMENT: 'Implement',
  PR_REVIEW: 'PR Review',
  PR_HUMAN_REVIEW: 'Human Review',
  FIXER: 'Fixer',
  TESTING: 'Testing',
  DOC_REVIEW: 'Doc Review',
  MERGE_READY: 'Merge Ready',
  DONE: 'Done',
};

const STAGE_COLORS: Record<IssueStage, string> = {
  BACKLOG: 'bg-gray-600',
  TODO: 'bg-blue-600',
  CONTEXT_PACK: 'bg-yellow-600',
  CONTEXT_REVIEW: 'bg-yellow-700',
  SPEC: 'bg-orange-600',
  SPEC_REVIEW: 'bg-orange-700',
  IMPLEMENT: 'bg-green-600',
  PR_REVIEW: 'bg-green-700',
  PR_HUMAN_REVIEW: 'bg-purple-600',
  FIXER: 'bg-red-600',
  TESTING: 'bg-teal-600',
  DOC_REVIEW: 'bg-cyan-600',
  MERGE_READY: 'bg-indigo-600',
  DONE: 'bg-gray-500',
};

export function KanbanColumn({ stage, issues, onIssueClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] w-72 flex-shrink-0 flex-col rounded-lg border border-gray-700 bg-gray-850 ${
        isOver ? 'border-blue-500 bg-gray-800' : ''
      }`}
      data-testid={`column-${stage}`}
    >
      <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
        <span className={`h-2 w-2 rounded-full ${STAGE_COLORS[stage]}`} />
        <h2 className="text-sm font-medium text-gray-200">{STAGE_LABELS[stage]}</h2>
        <span className="ml-auto text-xs text-gray-500">{issues.length}</span>
      </div>

      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
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
