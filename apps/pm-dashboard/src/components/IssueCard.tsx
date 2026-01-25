import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { IssueDto } from '../api/types';
import { LabelPill } from './LabelPill';
import { StageBadge } from './StageBadge';

interface IssueCardProps {
  issue: IssueDto;
  onOpen: (issueId: string) => void;
}

export function IssueCard({ issue, onOpen }: IssueCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
    data: { stage: issue.stage }
  });

  const style = {
    transform: CSS.Translate.toString(transform)
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`issue-${issue.id}`}
      data-stage={issue.stage}
      className={`group cursor-grab rounded-2xl border border-ink-100/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isDragging ? 'opacity-60' : ''
      }`}
      onClick={() => {
        if (!isDragging) {
          onOpen(issue.id);
        }
      }}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">{issue.title}</p>
          <p className="text-xs text-ink-500">#{issue.number}</p>
        </div>
        <StageBadge stage={issue.stage} />
      </div>
      {issue.labels.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {issue.labels.map((label) => (
            <LabelPill key={label.id} label={label} />
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
        <span className="rounded-full bg-ink-100 px-2 py-1 font-semibold text-ink-700">
          {issue.assignedAgentId ? `Agent ${issue.assignedAgentId}` : 'Unassigned'}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wide">Drag</span>
      </div>
    </div>
  );
}
