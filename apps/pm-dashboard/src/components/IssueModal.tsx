import { useMemo, useState } from 'react';
import type { AsyncState, CommentDto, IssueDto, LabelDto } from '../types';

interface IssueModalProps {
  issue: IssueDto;
  labels: LabelDto[];
  commentsState: AsyncState<CommentDto[]> | undefined;
  onClose: () => void;
  onAddComment: (content: string, authorName?: string) => Promise<void>;
  onToggleLabel: (labelId: string, nextChecked: boolean) => Promise<void>;
}

export function IssueModal({
  issue,
  labels,
  commentsState,
  onClose,
  onAddComment,
  onToggleLabel
}: IssueModalProps) {
  const [commentText, setCommentText] = useState('');
  const [authorName, setAuthorName] = useState('');
  const selectedLabelIds = useMemo(() => new Set(issue.labels.map((label) => label.id)), [issue]);

  const isSubmitting = commentText.trim().length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-ink-100 bg-white p-6 shadow-2xl"
        data-testid="issue-modal"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-ink-700">Issue #{issue.number}</p>
            <h2 className="font-display text-2xl font-semibold text-ink-900">
              {issue.title}
            </h2>
            <p className="mt-2 text-sm text-ink-700">Stage: {issue.stage}</p>
          </div>
          <button
            className="rounded-full border border-ink-100 px-4 py-2 text-sm font-semibold"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink-900">Description</h3>
              <p className="mt-2 text-sm text-ink-700">
                {issue.description ?? 'No description yet.'}
              </p>
            </div>

            <div>
              <h3 className="font-display text-lg font-semibold text-ink-900">Comments</h3>
              <div className="mt-3 space-y-3">
                {commentsState?.status === 'loading' ? (
                  <p className="text-sm text-ink-700">Loading comments...</p>
                ) : null}
                {commentsState?.status === 'error' ? (
                  <p className="text-sm text-ink-700">{commentsState.error}</p>
                ) : null}
                {commentsState?.status === 'success' ? (
                  commentsState.data.length ? (
                    commentsState.data.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-2xl border border-ink-100 bg-ink-100/40 px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-700">
                            {comment.authorName} · {comment.authorType}
                          </p>
                          <p className="text-xs text-ink-700">
                            {new Date(comment.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-ink-900">{comment.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-ink-700">No comments yet.</p>
                  )
                ) : null}
              </div>

              <form
                className="mt-4 space-y-3 rounded-2xl border border-ink-100 bg-white/80 p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (isSubmitting) {
                    return;
                  }
                  await onAddComment(commentText.trim(), authorName.trim() || undefined);
                  setCommentText('');
                  setAuthorName('');
                }}
              >
                <input
                  className="w-full rounded-xl border border-ink-100 px-3 py-2 text-sm"
                  placeholder="Your name (optional)"
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                />
                <textarea
                  className="min-h-[90px] w-full rounded-xl border border-ink-100 px-3 py-2 text-sm"
                  placeholder="Add a comment"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                />
                <button
                  className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink-700"
                  type="submit"
                  disabled={isSubmitting}
                >
                  Send Comment
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink-900">Assigned</h3>
              <p className="mt-2 text-sm text-ink-700">
                {issue.assignedAgentId ? `Agent ${issue.assignedAgentId}` : 'Unassigned'}
              </p>
            </div>

            <div>
              <h3 className="font-display text-lg font-semibold text-ink-900">Labels</h3>
              <div className="mt-3 space-y-2">
                {labels.map((label) => {
                  const checked = selectedLabelIds.has(label.id);
                  return (
                    <label
                      key={label.id}
                      className="flex items-center justify-between rounded-2xl border border-ink-100 bg-white/90 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm text-ink-900">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        {label.name}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={async () => {
                          await onToggleLabel(label.id, !checked);
                        }}
                      />
                    </label>
                  );
                })}
                {!labels.length ? (
                  <p className="text-sm text-ink-700">No labels configured.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
