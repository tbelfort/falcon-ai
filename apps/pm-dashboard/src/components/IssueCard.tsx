import { useSortable } from '@dnd-kit/sortable';
import type { IssueDto } from '@/api/types';
import { StageBadge } from './StageBadge';

interface IssueCardProps {
  issue: IssueDto;
  onSelect: (issueId: string) => void;
  index: number;
}

function toTransform(transform: { x: number; y: number } | null): string | undefined {
  if (!transform) {
    return undefined;
  }
  return `translate3d(${transform.x}px, ${transform.y}px, 0)`;
}

export function IssueCard({ issue, onSelect, index }: IssueCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: issue.id,
    data: { stage: issue.stage },
  });

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`surface shadow-soft cursor-grab rounded-2xl p-4 text-sm transition hover:-translate-y-0.5 active:cursor-grabbing ${
        isDragging ? 'opacity-60' : 'opacity-100'
      }`}
      style={{
        transform: toTransform(transform),
        transition,
        animationDelay: `${index * 40}ms`,
      }}
      onClick={() => {
        if (!isDragging) {
          onSelect(issue.id);
        }
      }}
      data-testid={`issue-card-${issue.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-steel">Issue #{issue.number}</p>
          <h3 className="mt-1 text-base font-semibold text-ink">{issue.title}</h3>
        </div>
        <StageBadge stage={issue.stage} />
      </div>

      {issue.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="rounded-full border px-2.5 py-1 text-xs font-semibold"
              style={{ borderColor: label.color, color: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {issue.assignedAgentId && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-steel">
          Agent {issue.assignedAgentId}
        </div>
      )}
    </article>
  );
}
