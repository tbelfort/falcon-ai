import { useMemo, useState } from 'react';
import type { CommentDto, IssueDto, LabelDto } from '@/api/types';
import type { AsyncState } from '@/stores/types';
import { StageBadge } from './StageBadge';

interface IssueDetailModalProps {
  issue: IssueDto;
  labels: LabelDto[];
  commentsState: AsyncState<CommentDto[]> | undefined;
  onClose: () => void;
  onAddComment: (content: string) => Promise<void>;
  onToggleLabel: (labelId: string, nextSelected: string[]) => Promise<void>;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function IssueDetailModal({
  issue,
  labels,
  commentsState,
  onClose,
  onAddComment,
  onToggleLabel,
}: IssueDetailModalProps) {
  const [commentDraft, setCommentDraft] = useState('');
  const selectedLabelIds = useMemo(() => issue.labels.map((label) => label.id), [issue.labels]);

  const handleSubmit = async () => {
    const trimmed = commentDraft.trim();
    if (!trimmed) {
      return;
    }
    await onAddComment(trimmed);
    setCommentDraft('');
  };

  const toggleLabel = async (labelId: string) => {
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId];
    await onToggleLabel(labelId, next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(27,27,22,0.45)] px-4 py-12">
      <div className="surface w-full max-w-3xl rounded-3xl p-8" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-steel">Issue #{issue.number}</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{issue.title}</h2>
          </div>
          <button
            className="rounded-full border border-[rgba(27,27,22,0.2)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StageBadge stage={issue.stage} />
          {issue.assignedAgentId && (
            <span className="rounded-full bg-[var(--sky)] px-3 py-1 text-xs font-semibold text-steel">
              Agent {issue.assignedAgentId}
            </span>
          )}
        </div>

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-steel">Description</h3>
          <p className="mt-3 text-sm text-ink">
            {issue.description ?? 'No description yet.'}
          </p>
        </section>

        <section className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-steel">Labels</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {labels.map((label) => {
              const isSelected = selectedLabelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggleLabel(label.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    isSelected ? 'shadow-soft' : 'opacity-70'
                  }`}
                  style={{ borderColor: label.color, color: label.color }}
                >
                  {label.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-steel">Comments</h3>
          <div className="mt-3 space-y-3">
            {commentsState?.status === 'loading' && (
              <div className="rounded-2xl border border-dashed border-[rgba(27,27,22,0.2)] p-4 text-xs text-steel">
                Loading comments...
              </div>
            )}
            {commentsState?.status === 'error' && (
              <div className="rounded-2xl border border-dashed border-[rgba(27,27,22,0.2)] p-4 text-xs text-rose-700">
                {commentsState.error}
              </div>
            )}
            {commentsState?.status === 'success' && commentsState.data.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[rgba(27,27,22,0.2)] p-4 text-xs text-steel">
                No comments yet.
              </div>
            )}
            {commentsState?.status === 'success' &&
              commentsState.data.map((comment) => (
                <div key={comment.id} className="rounded-2xl border border-[rgba(27,27,22,0.1)] p-4">
                  <div className="flex items-center justify-between text-xs text-steel">
                    <span>
                      {comment.authorName} ({comment.authorType})
                    </span>
                    <span>{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink">{comment.content}</p>
                </div>
              ))}
          </div>
        </section>

        <section className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-steel">Add Comment</h3>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <textarea
              className="min-h-[90px] flex-1 rounded-2xl border border-[rgba(27,27,22,0.15)] bg-white px-4 py-3 text-sm"
              placeholder="Share a quick update or decision"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
            />
            <button
              type="button"
              className="h-fit rounded-full bg-[var(--clay)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white"
              onClick={handleSubmit}
            >
              Post
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
