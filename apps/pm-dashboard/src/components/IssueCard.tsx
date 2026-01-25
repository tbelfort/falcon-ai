import { useSortable } from '@dnd-kit/sortable';
import type { IssueDto } from '../api/types';
import { StageBadge } from './StageBadge';

interface IssueCardProps {
  issue: IssueDto;
  onOpen: (issueId: string) => void;
}

export function IssueCard({ issue, onOpen }: IssueCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    data: { stage: issue.stage },
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={() => {
        if (!isDragging) {
          onOpen(issue.id);
        }
      }}
      className={`w-full rounded-2xl border border-white/70 bg-white/90 p-4 text-left shadow-glow transition hover:-translate-y-0.5 hover:shadow-lg ${
        isDragging ? 'opacity-70' : ''
      }`}
      data-testid={`issue-card-${issue.id}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">#{issue.number}</p>
          <h3 className="mt-1 text-base font-semibold text-ink-800">{issue.title}</h3>
        </div>
        <StageBadge stage={issue.stage} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {issue.labels.map((label) => (
          <span
            key={label.id}
            className="rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: label.color }}
          >
            {label.name}
          </span>
        ))}
      </div>
      {issue.assignedAgentId ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-600">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          Assigned: {issue.assignedAgentId}
        </div>
      ) : null}
    </button>
  );
}
