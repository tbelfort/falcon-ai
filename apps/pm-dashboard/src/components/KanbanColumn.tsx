import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { IssueStage } from '../types';

interface KanbanColumnProps {
  stage: IssueStage;
  label: string;
  count: number;
  children: ReactNode;
}

export function KanbanColumn({ stage, label, count, children }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: stage });

  return (
    <section
      ref={setNodeRef}
      className={`flex h-full w-72 flex-col gap-3 rounded-3xl border border-ink-100 bg-white/70 p-4 shadow-card backdrop-blur-sm transition ${
        isOver ? 'ring-2 ring-sea-400' : ''
      }`}
      data-testid={`column-${stage}`}
    >
      <header className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-ink-700">
          {label}
        </h2>
        <span className="rounded-full bg-ink-900 px-2 py-1 text-xs font-semibold text-white">
          {count}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-3">{children}</div>
    </section>
  );
}
