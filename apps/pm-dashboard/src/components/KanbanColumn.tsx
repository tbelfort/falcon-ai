import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { IssueStage } from '../api/types';
import { formatStage } from '../utils/format';

interface KanbanColumnProps {
  stage: IssueStage;
  count: number;
  children: ReactNode;
}

export function KanbanColumn({ stage, count, children }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: stage, data: { stage } });

  return (
    <div
      ref={setNodeRef}
      className={`glass-panel flex h-full min-h-[220px] flex-col rounded-3xl border border-white/70 p-4 transition ${
        isOver ? 'ring-2 ring-sky-400/60' : ''
      }`}
      data-testid={`kanban-column-${stage}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-600">
          {formatStage(stage)}
        </h2>
        <span className="rounded-full bg-ink-600/10 px-2 py-1 text-xs font-semibold text-ink-600">
          {count}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </div>
  );
}
