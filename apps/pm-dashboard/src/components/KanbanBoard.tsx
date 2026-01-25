import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useState } from 'react';
import type { IssueDto, IssueStage } from '../types';
import { ISSUE_STAGES } from '../types';
import { useIssueStore } from '../stores/issueStore';
import { useUIStore } from '../stores/uiStore';
import { KanbanColumn } from './KanbanColumn';
import { IssueCard } from './IssueCard';

interface KanbanBoardProps {
  projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const { issues, loading, transitionIssue } = useIssueStore();
  const selectIssue = useUIStore((s) => s.selectIssue);
  const [activeIssue, setActiveIssue] = useState<IssueDto | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const projectIssues = issues.filter((i) => i.projectId === projectId);

  const issuesByStage = ISSUE_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = projectIssues.filter((i) => i.stage === stage);
      return acc;
    },
    {} as Record<IssueStage, IssueDto[]>
  );

  const handleDragStart = (event: DragStartEvent) => {
    const issue = projectIssues.find((i) => i.id === event.active.id);
    setActiveIssue(issue || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveIssue(null);

    const { active, over } = event;
    if (!over) return;

    const issueId = active.id as string;
    const targetStage = over.id as IssueStage;

    const issue = projectIssues.find((i) => i.id === issueId);
    if (!issue || issue.stage === targetStage) return;

    transitionIssue(issueId, targetStage);
  };

  const handleIssueClick = (issueId: string) => {
    selectIssue(issueId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading issues...</div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-4 overflow-x-auto pb-4"
        data-testid="kanban-board"
      >
        {ISSUE_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            issues={issuesByStage[stage]}
            onIssueClick={handleIssueClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeIssue && (
          <IssueCard issue={activeIssue} onClick={() => {}} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
