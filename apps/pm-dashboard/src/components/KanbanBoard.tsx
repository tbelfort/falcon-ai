import { useCallback, useEffect } from 'react';
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
import { ALL_STAGES, type IssueDto, type IssueStage } from '../types';
import { useIssueStore } from '../stores/issueStore';
import { useProjectStore } from '../stores/projectStore';
import { useUiStore } from '../stores/uiStore';
import { KanbanColumn } from './KanbanColumn';
import { IssueCard } from './IssueCard';

export function KanbanBoard() {
  const { issues, fetchIssues, transitionIssue, error, clearError } = useIssueStore();
  const { selectedProjectId } = useProjectStore();
  const { openModal } = useUiStore();
  const [activeIssue, setActiveIssue] = useState<IssueDto | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    if (selectedProjectId) {
      fetchIssues(selectedProjectId);
    }
  }, [selectedProjectId, fetchIssues]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const issue = active.data.current?.issue as IssueDto | undefined;
    if (issue) {
      setActiveIssue(issue);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveIssue(null);

      if (!over) return;

      const overId = over.id as string;
      const issue = active.data.current?.issue as IssueDto | undefined;

      if (!issue) return;

      // Check if dropped on a column (stage)
      const isStage = ALL_STAGES.includes(overId as IssueStage);
      const targetStage = isStage ? (overId as IssueStage) : null;

      if (targetStage && targetStage !== issue.stage) {
        transitionIssue(issue.id, targetStage);
      }
    },
    [transitionIssue]
  );

  const handleIssueClick = useCallback(
    (issueId: string) => {
      openModal(issueId);
    },
    [openModal]
  );

  if (issues.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading issues...</div>
      </div>
    );
  }

  if (issues.status === 'error') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error: {issues.error}</div>
      </div>
    );
  }

  if (issues.status !== 'success') {
    return null;
  }

  const issuesByStage = ALL_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = issues.data.filter((issue) => issue.stage === stage);
      return acc;
    },
    {} as Record<IssueStage, IssueDto[]>
  );

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={clearError}
            className="text-red-700 hover:text-red-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {ALL_STAGES.map((stage) => (
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
            <div className="opacity-80">
              <IssueCard issue={activeIssue} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
