import { DndContext, MouseSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import type { IssueDto, IssueStage } from '../api/types';
import { isIssueStage, issueStages } from '../constants/stages';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  issues: IssueDto[];
  onIssueOpen: (issueId: string) => void;
  onStageChange: (issueId: string, stage: IssueStage) => void;
}

export function KanbanBoard({ issues, onIssueOpen, onStageChange }: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 }
    })
  );

  const grouped = issueStages.reduce<Record<IssueStage, IssueDto[]>>((acc, stage) => {
    acc[stage] = [];
    return acc;
  }, {} as Record<IssueStage, IssueDto[]>);

  issues.forEach((issue) => {
    grouped[issue.stage].push(issue);
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id;
    if (!overId) {
      return;
    }
    const stageId = String(overId);
    if (!isIssueStage(stageId)) {
      return;
    }
    const issueId = String(event.active.id);
    onStageChange(issueId, stageId);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-6">
        {issueStages.map((stage) => (
          <KanbanColumn key={stage} stage={stage} issues={grouped[stage]} onIssueOpen={onIssueOpen} />
        ))}
      </div>
    </DndContext>
  );
}
