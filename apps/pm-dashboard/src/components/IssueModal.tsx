import { useMemo, useState, type FormEvent } from 'react';
import type { AsyncState, CommentDto, IssueDto, LabelDto } from '../types';
import { LabelPill } from './LabelPill';
import { StageBadge } from './StageBadge';

interface IssueModalProps {
  issue: IssueDto | null;
  isOpen: boolean;
  labelsState: AsyncState<LabelDto[]>;
  commentsState: AsyncState<CommentDto[]> | undefined;
  onClose: () => void;
  onToggleLabels: (labelIds: string[]) => Promise<void>;
  onAddComment: (content: string, authorName?: string) => Promise<void>;
}

export function IssueModal({
  issue,
  isOpen,
  labelsState,
  commentsState,
  onClose,
  onToggleLabels,
  onAddComment
}: IssueModalProps) {
  const [commentBody, setCommentBody] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedLabelIds = useMemo(
    () => issue?.labels.map((label) => label.id) ?? [],
    [issue]
  );

  if (!isOpen || !issue) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!commentBody.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onAddComment(commentBody.trim(), authorName.trim() || undefined);
      setCommentBody('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleLabel = async (labelId: string) => {
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId];
    await onToggleLabels(next);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="pm-card w-full max-w-3xl rounded-3xl p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-orange-500">Issue #{issue.number}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{issue.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StageBadge stage={issue.stage} />
              <span className="text-xs text-slate-500">
                {issue.assignedAgentId ? `Agent ${issue.assignedAgentId}` : 'Unassigned'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:border-slate-400"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold text-slate-700">Description</h3>
              <p className="mt-2 text-sm text-slate-600">
                {issue.description ?? 'No description yet.'}
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700">Comments</h3>
              <div className="mt-3 space-y-3">
                {commentsState?.status === 'loading' && (
                  <p className="text-sm text-slate-500">Loading comments...</p>
                )}
                {commentsState?.status === 'error' && (
                  <p className="text-sm text-rose-500">{commentsState.error}</p>
                )}
                {commentsState?.status === 'success' && commentsState.data.length === 0 && (
                  <p className="text-sm text-slate-500">No comments yet.</p>
                )}
                {commentsState?.status === 'success' &&
                  commentsState.data.map((comment) => (
                    <div key={comment.id} className="rounded-2xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{comment.authorName}</span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{comment.content}</p>
                    </div>
                  ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700">Add comment</h3>
              <form onSubmit={handleSubmit} className="mt-3 grid gap-2">
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
                  placeholder="Author name (optional)"
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                />
                <textarea
                  className="min-h-[90px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
                  placeholder="Write your update..."
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                />
                <button
                  type="submit"
                  className="inline-flex w-fit items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending...' : 'Send comment'}
                </button>
              </form>
            </section>
          </div>

          <aside className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold text-slate-700">Labels</h3>
              {labelsState.status === 'loading' && (
                <p className="mt-2 text-sm text-slate-500">Loading labels...</p>
              )}
              {labelsState.status === 'error' && (
                <p className="mt-2 text-sm text-rose-500">{labelsState.error}</p>
              )}
              {labelsState.status === 'success' && (
                <div className="mt-3 space-y-2">
                  {labelsState.data.map((label) => (
                    <label
                      key={label.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedLabelIds.includes(label.id)}
                          onChange={() => toggleLabel(label.id)}
                        />
                        <LabelPill label={label} />
                      </span>
                      <span className="text-xs text-slate-400">{label.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700">Stage notes</h3>
              <p className="mt-2 text-sm text-slate-500">
                Stage messages are not exposed yet. Hooked to API when available.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
