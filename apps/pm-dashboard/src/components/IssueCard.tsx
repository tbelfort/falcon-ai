import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { IssueDto } from '../types';

interface IssueCardProps {
  issue: IssueDto;
  onClick: () => void;
}

export function IssueCard({ issue, onClick }: IssueCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-sm hover:border-gray-600 hover:bg-gray-750"
      data-testid={`issue-card-${issue.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-gray-500">#{issue.number}</span>
        {issue.assignedAgentId && (
          <span className="rounded bg-purple-900 px-1.5 py-0.5 text-xs text-purple-300">
            {issue.assignedAgentId}
          </span>
        )}
      </div>

      <h3 className="mt-1 text-sm font-medium text-gray-100">{issue.title}</h3>

      {issue.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="rounded px-1.5 py-0.5 text-xs"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
