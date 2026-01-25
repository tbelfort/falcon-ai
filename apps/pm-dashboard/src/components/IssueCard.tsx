import { useDraggable } from '@dnd-kit/core';
import type { IssueDto } from '../types';
import { LabelPill } from './LabelPill';
import { StageBadge } from './StageBadge';

interface IssueCardProps {
  issue: IssueDto;
  onOpen: (issueId: string) => void;
}

export function IssueCard({ issue, onOpen }: IssueCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
    data: {
      stage: issue.stage
    }
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`issue-card-${issue.id}`}
      className={`pm-card group w-full rounded-2xl border border-transparent p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
        isDragging ? 'opacity-60' : 'opacity-100'
      }`}
      style={style}
      onClick={() => onOpen(issue.id)}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-orange-500">#{issue.number}</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">{issue.title}</h3>
        </div>
        <StageBadge stage={issue.stage} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {issue.labels.map((label) => (
          <LabelPill key={label.id} label={label} />
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {issue.assignedAgentId ? `Agent ${issue.assignedAgentId}` : 'Unassigned'}
      </div>
    </button>
  );
}
