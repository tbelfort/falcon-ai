import {
  DndContext,
  MouseSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { IssueDto, IssueStage } from '@/api/types';
import { STAGE_ORDER } from '@/utils/stages';
import { IssueColumn } from './IssueColumn';

interface KanbanBoardProps {
  issues: IssueDto[];
  onSelectIssue: (issueId: string) => void;
  onMoveIssue: (issueId: string, toStage: IssueStage) => void;
}

export function KanbanBoard({ issues, onSelectIssue, onMoveIssue }: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  const issuesByStage = STAGE_ORDER.reduce<Record<IssueStage, IssueDto[]>>((acc, stage) => {
    acc[stage] = [];
    return acc;
  }, {} as Record<IssueStage, IssueDto[]>);

  issues.forEach((issue) => {
    // Guard against unknown stages to prevent TypeError
    if (issuesByStage[issue.stage]) {
      issuesByStage[issue.stage].push(issue);
    }
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) {
      return;
    }

    let targetStage: IssueStage | undefined;
    if (STAGE_ORDER.includes(overId as IssueStage)) {
      targetStage = overId as IssueStage;
    } else {
      const issue = issues.find((item) => item.id === overId);
      targetStage = issue?.stage;
    }

    const activeIssue = issues.find((item) => item.id === activeId);
    if (!activeIssue || !targetStage || activeIssue.stage === targetStage) {
      return;
    }

    onMoveIssue(activeId, targetStage);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="scroll-fade flex h-full gap-5 overflow-x-auto pb-8">
        {STAGE_ORDER.map((stage) => (
          <IssueColumn
            key={stage}
            stage={stage}
            issues={issuesByStage[stage]}
            onSelectIssue={onSelectIssue}
          />
        ))}
      </div>
    </DndContext>
  );
}
