import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { IssueDto } from '../../api/types';
import { useUiStore } from '../../stores/uiStore';

interface IssueCardProps {
  issue: IssueDto;
}

export function IssueCard({ issue }: IssueCardProps) {
  const openIssueModal = useUiStore((s) => s.openIssueModal);
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

  const handleClick = () => {
    openIssueModal(issue.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow"
      data-testid={`issue-card-${issue.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-gray-500 font-mono">#{issue.number}</span>
        {issue.assignedAgentId && (
          <span
            className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded"
            title={`Agent: ${issue.assignedAgentId}`}
          >
            {issue.assignedAgentId.split('-').pop()}
          </span>
        )}
      </div>
      <h4 className="text-sm font-medium text-gray-900 mt-1 line-clamp-2">
        {issue.title}
      </h4>
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="text-xs px-1.5 py-0.5 rounded"
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
