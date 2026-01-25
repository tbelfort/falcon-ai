import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useMemo } from 'react';
import type { IssueDto, IssueStage } from '../types';
import { ISSUE_STAGES, STAGE_LABELS } from '../types';
import { IssueCard } from './IssueCard';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  issues: IssueDto[];
  onOpenIssue: (issueId: string) => void;
  onMoveIssue: (issueId: string, toStage: IssueStage) => void;
}

function findStage(issues: IssueDto[], issueId: string) {
  return issues.find((issue) => issue.id === issueId)?.stage ?? null;
}

export function KanbanBoard({ issues, onOpenIssue, onMoveIssue }: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );

  const grouped = useMemo(() => {
    return ISSUE_STAGES.map((stage) => ({
      stage,
      issues: issues.filter((issue) => issue.stage === stage)
    }));
  }, [issues]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        const activeId = String(event.active.id);
        const overId = event.over?.id ? String(event.over.id) : null;
        if (!overId) {
          return;
        }
        const isStageTarget = ISSUE_STAGES.includes(overId as IssueStage);
        const targetStage = isStageTarget
          ? (overId as IssueStage)
          : findStage(issues, overId);
        if (!targetStage) {
          return;
        }
        onMoveIssue(activeId, targetStage);
      }}
    >
      <div className="flex gap-4 overflow-x-auto pb-6">
        {grouped.map(({ stage, issues: stageIssues }) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            label={STAGE_LABELS[stage]}
            count={stageIssues.length}
          >
            <SortableContext
              items={stageIssues.map((issue) => issue.id)}
              strategy={verticalListSortingStrategy}
            >
              {stageIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onOpen={onOpenIssue}
                  onMoveStage={onMoveIssue}
                  stages={ISSUE_STAGES}
                />
              ))}
            </SortableContext>
          </KanbanColumn>
        ))}
      </div>
    </DndContext>
  );
}
