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
  } = useSortable({ id: issue.id, data: { issue } });

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
      className="bg-white rounded-lg shadow p-3 cursor-pointer hover:shadow-md transition-shadow border border-gray-200"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 mb-1">#{issue.number}</div>
          <h4 className="text-sm font-medium text-gray-900 truncate">{issue.title}</h4>
        </div>
      </div>

      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
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

      {issue.assignedAgentId && (
        <div className="mt-2 flex items-center gap-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Agent: {issue.assignedAgentId}
          </span>
        </div>
      )}
    </div>
  );
}
