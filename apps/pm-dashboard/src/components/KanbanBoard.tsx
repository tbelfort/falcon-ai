import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { IssueDto, IssueStage } from '../api/types';
import { ISSUE_STAGES } from '../api/types';
import { IssueCard } from './IssueCard';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  issues: IssueDto[];
  onIssueOpen: (issueId: string) => void;
  onIssueMove: (issueId: string, stage: IssueStage) => void;
}

export function KanbanBoard({ issues, onIssueOpen, onIssueMove }: KanbanBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const issuesByStage = ISSUE_STAGES.reduce<Record<IssueStage, IssueDto[]>>((acc, stage) => {
    acc[stage] = issues.filter((issue) => issue.stage === stage);
    return acc;
  }, {} as Record<IssueStage, IssueDto[]>);

  const handleDragEnd = (event: DragEndEvent) => {
    const stage = event.over?.data.current?.stage as IssueStage | undefined;
    const activeStage = event.active.data.current?.stage as IssueStage | undefined;
    if (!stage || !activeStage || stage === activeStage) {
      return;
    }
    onIssueMove(String(event.active.id), stage);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="scrollbar-thin grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-4">
        {ISSUE_STAGES.map((stage) => (
          <KanbanColumn key={stage} stage={stage} count={issuesByStage[stage].length}>
            <SortableContext
              items={issuesByStage[stage].map((issue) => issue.id)}
              strategy={verticalListSortingStrategy}
            >
              {issuesByStage[stage].map((issue) => (
                <IssueCard key={issue.id} issue={issue} onOpen={onIssueOpen} />
              ))}
            </SortableContext>
          </KanbanColumn>
        ))}
      </div>
    </DndContext>
  );
}
