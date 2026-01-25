import { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { IssueDto, IssueStage } from '../api/types';
import { ISSUE_STAGES, getStageLabel } from '../utils/stages';
import IssueCard from './IssueCard';

const emptyList: IssueDto[] = [];

function DraggableIssueCard({ issue, onSelect }: { issue: IssueDto; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
    data: { stage: issue.stage }
  });

  const style = transform
    ? {
        transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(
          transform.y
        )}px, 0)`
      }
    : undefined;

  return (
    <IssueCard
      ref={setNodeRef}
      issue={issue}
      onSelect={onSelect}
      dragAttributes={attributes}
      dragListeners={listeners}
      style={style}
      isDragging={isDragging}
    />
  );
}

function StageColumn({
  stage,
  issues,
  onSelect
}: {
  stage: IssueStage;
  issues: IssueDto[];
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <section
      ref={setNodeRef}
      data-testid={`stage-column-${stage}`}
      className={`surface-muted flex min-w-[280px] flex-col gap-4 p-4 transition ${
        isOver ? 'ring-2 ring-[var(--accent-2)]' : ''
      }`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{getStageLabel(stage)}</h2>
        <span className="badge badge-muted">{issues.length}</span>
      </header>
      <div className="flex flex-col gap-3">
        {issues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--stroke)] p-4 text-sm text-[var(--ink-muted)]">
            Drop issues here
          </div>
        ) : (
          issues.map((issue) => <DraggableIssueCard key={issue.id} issue={issue} onSelect={onSelect} />)
        )}
      </div>
    </section>
  );
}

type KanbanBoardProps = {
  issues: IssueDto[];
  onIssueSelect: (issueId: string) => void;
  onStageChange: (issueId: string, toStage: IssueStage) => void;
};

export default function KanbanBoard({ issues, onIssueSelect, onStageChange }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const grouped = useMemo(() => {
    const result: Record<IssueStage, IssueDto[]> = Object.fromEntries(
      ISSUE_STAGES.map((stage) => [stage, []])
    ) as Record<IssueStage, IssueDto[]>;
    for (const issue of issues) {
      result[issue.stage].push(issue);
    }
    return result;
  }, [issues]);

  const activeIssue = useMemo(
    () => issues.find((issue) => issue.id === activeId) ?? null,
    [issues, activeId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeStage = event.active.data.current?.stage as IssueStage | undefined;
    const overStage = event.over?.id as IssueStage | undefined;

    setActiveId(null);

    if (!overStage || !activeStage || overStage === activeStage) {
      return;
    }

    onStageChange(String(event.active.id), overStage);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      collisionDetection={closestCenter}
    >
      <div className="board-scroll">
        {ISSUE_STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            issues={grouped[stage] ?? emptyList}
            onSelect={onIssueSelect}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIssue ? (
          <IssueCard issue={activeIssue} onSelect={onIssueSelect} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
