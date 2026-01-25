import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { IssueDto, IssueStage } from '../types';

interface IssueCardProps {
  issue: IssueDto;
  onOpen: (issueId: string) => void;
  onMoveStage: (issueId: string, toStage: IssueStage) => void;
  stages: IssueStage[];
}

export function IssueCard({ issue, onOpen, onMoveStage, stages }: IssueCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: issue.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border border-ink-100 bg-white/90 px-4 py-3 shadow-card transition ${
        isDragging ? 'opacity-70' : 'opacity-100'
      }`}
      data-testid={`issue-card-${issue.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(issue.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onOpen(issue.id);
        }
      }}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-700">#{issue.number}</p>
          <h3 className="font-display text-base font-semibold text-ink-900">
            {issue.title}
          </h3>
        </div>
        {issue.assignedAgentId ? (
          <span className="rounded-full bg-ink-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white">
            Agent {issue.assignedAgentId.slice(-2)}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="rounded-full px-2 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: label.color, color: '#0b0b0b' }}
            >
              {label.name}
            </span>
          ))}
        </div>
        <select
          className="rounded-full border border-ink-100 bg-white px-2 py-1 text-[11px]"
          value={issue.stage}
          data-testid={`issue-move-${issue.id}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            onMoveStage(issue.id, event.target.value as IssueStage);
          }}
        >
          {stages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
