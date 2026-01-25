import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { IssueDto, IssueStage } from '../types';
import { STAGE_LABELS, STAGE_ORDER } from '../utils/stages';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  issues: IssueDto[];
  onMoveIssue: (issueId: string, stage: IssueStage) => Promise<{ ok: boolean; error?: string }>;
  onOpenIssue: (issueId: string) => void;
  onMoveError: (message: string) => void;
  onClearError: () => void;
}

export function createDragEndHandler(
  onMoveIssue: KanbanBoardProps['onMoveIssue'],
  onMoveError: KanbanBoardProps['onMoveError'],
  onClearError: KanbanBoardProps['onClearError']
) {
  return async (event: DragEndEvent) => {
    const stage = event.over?.id;
    if (!stage || typeof stage !== 'string') {
      return;
    }
    if (!STAGE_ORDER.includes(stage as IssueStage)) {
      return;
    }

    const issueId = String(event.active.id);
    const result = await onMoveIssue(issueId, stage as IssueStage);
    if (!result.ok) {
      onMoveError(result.error ?? 'Unable to move issue.');
      return;
    }
    onClearError();
  };
}

export function KanbanBoard({
  issues,
  onMoveIssue,
  onOpenIssue,
  onMoveError,
  onClearError
}: KanbanBoardProps) {
  const handler = createDragEndHandler(onMoveIssue, onMoveError, onClearError);

  const issuesByStage = STAGE_ORDER.reduce<Record<IssueStage, IssueDto[]>>((acc, stage) => {
    acc[stage] = issues.filter((issue) => issue.stage === stage);
    return acc;
  }, {} as Record<IssueStage, IssueDto[]>);

  return (
    <DndContext onDragEnd={handler}>
      <div className="pm-scrollbar flex gap-4 overflow-x-auto pb-4">
        {STAGE_ORDER.map((stage, index) => (
          <div key={stage} className="animate-fade-up" style={{ animationDelay: `${index * 40}ms` }}>
            <KanbanColumn
              stage={stage}
              title={STAGE_LABELS[stage]}
              issues={issuesByStage[stage]}
              onOpenIssue={onOpenIssue}
            />
          </div>
        ))}
      </div>
    </DndContext>
  );
}
