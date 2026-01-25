import { forwardRef, type CSSProperties } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import { IssueDto } from '../api/types';
import StageBadge from './StageBadge';
import AssignedAgentBadge from './AssignedAgentBadge';

type IssueCardProps = {
  issue: IssueDto;
  onSelect: (issueId: string) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: Record<string, unknown>;
  style?: CSSProperties;
  isDragging?: boolean;
  isOverlay?: boolean;
};

const IssueCard = forwardRef<HTMLDivElement, IssueCardProps>(
  ({ issue, onSelect, dragAttributes, dragListeners, style, isDragging, isOverlay }, ref) => {
    const safeAttributes = dragAttributes ?? {};
    const safeListeners = dragListeners ?? {};

    return (
      <div
        ref={ref}
        style={style}
        className={`issue-card flex cursor-grab flex-col gap-3 active:cursor-grabbing ${
          isDragging ? 'is-dragging' : ''
        } ${
          isOverlay ? 'shadow-2xl' : ''
        }`}
        data-testid={`issue-card-${issue.id}`}
        data-stage={issue.stage}
        {...safeAttributes}
        {...safeListeners}
        onClick={() => onSelect(issue.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(issue.id);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              #{issue.number}
            </p>
            <h3 className="text-base font-semibold text-[var(--ink)]">{issue.title}</h3>
          </div>
          <StageBadge stage={issue.stage} />
        </div>

        {issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {issue.labels.map((label) => (
              <span
                key={label.id}
                className="badge"
                style={{
                  background: `${label.color}22`,
                  color: label.color,
                  border: `1px solid ${label.color}55`
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        {issue.assignedAgentId && <AssignedAgentBadge agentId={issue.assignedAgentId} />}
      </div>
    );
  }
);

IssueCard.displayName = 'IssueCard';

export default IssueCard;
