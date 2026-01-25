import { useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { useState } from 'react';
import type { IssueDto, IssueStage } from '../../api/types';
import { ALL_STAGES } from '../../api/types';
import { useIssueStore } from '../../stores/issueStore';
import { useUiStore } from '../../stores/uiStore';
import { ApiClientError } from '../../api/client';
import { KanbanColumn } from './KanbanColumn';
import { IssueCard } from './IssueCard';

export function KanbanBoard() {
  const issues = useIssueStore((s) => s.issues);
  const transitionIssue = useIssueStore((s) => s.transitionIssue);
  const showError = useUiStore((s) => s.showError);
  const [activeIssue, setActiveIssue] = useState<IssueDto | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const issuesByStage = useCallback(
    (stage: IssueStage): IssueDto[] => {
      if (issues.status !== 'success') return [];
      return issues.data.filter((i) => i.stage === stage);
    },
    [issues]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const issueId = event.active.id as string;
    if (issues.status === 'success') {
      const issue = issues.data.find((i) => i.id === issueId);
      setActiveIssue(issue || null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);

    const { active, over } = event;
    if (!over) return;

    const issueId = active.id as string;
    const targetStage = over.id as IssueStage;

    if (issues.status !== 'success') return;

    const issue = issues.data.find((i) => i.id === issueId);
    if (!issue || issue.stage === targetStage) return;

    try {
      await transitionIssue(issueId, targetStage);
    } catch (e) {
      const message =
        e instanceof ApiClientError
          ? e.message
          : 'Failed to move issue';
      showError(message);
    }
  };

  if (issues.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading">
        <div className="text-gray-500">Loading issues...</div>
      </div>
    );
  }

  if (issues.status === 'error') {
    return (
      <div className="flex items-center justify-center h-64" data-testid="error">
        <div className="text-red-500">{issues.error}</div>
      </div>
    );
  }

  if (issues.status === 'idle') {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-4 overflow-x-auto p-4"
        data-testid="kanban-board"
      >
        {ALL_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            issues={issuesByStage(stage)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIssue ? <IssueCard issue={activeIssue} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
