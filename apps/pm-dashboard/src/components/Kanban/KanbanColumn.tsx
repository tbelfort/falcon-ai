import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { IssueDto, IssueStage } from '../../api/types';
import { IssueCard } from './IssueCard';

interface KanbanColumnProps {
  stage: IssueStage;
  issues: IssueDto[];
}

const stageLabels: Record<IssueStage, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To Do',
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

const stageColors: Record<IssueStage, string> = {
  BACKLOG: 'bg-gray-100',
  TODO: 'bg-blue-100',
  CONTEXT_PACK: 'bg-indigo-100',
  CONTEXT_REVIEW: 'bg-indigo-100',
  SPEC: 'bg-violet-100',
  SPEC_REVIEW: 'bg-violet-100',
  IMPLEMENT: 'bg-amber-100',
  PR_REVIEW: 'bg-orange-100',
  PR_HUMAN_REVIEW: 'bg-orange-100',
  FIXER: 'bg-red-100',
  TESTING: 'bg-cyan-100',
  DOC_REVIEW: 'bg-teal-100',
  MERGE_READY: 'bg-emerald-100',
  DONE: 'bg-green-100',
};

export function KanbanColumn({ stage, issues }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-lg ${stageColors[stage]} ${
        isOver ? 'ring-2 ring-blue-500' : ''
      }`}
      data-testid={`column-${stage}`}
    >
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            {stageLabels[stage]}
          </h3>
          <span className="text-xs text-gray-500 bg-white/50 px-2 py-0.5 rounded-full">
            {issues.length}
          </span>
        </div>
      </div>
      <div className="p-2 min-h-[200px] max-h-[calc(100vh-200px)] overflow-y-auto">
        <SortableContext
          items={issues.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
