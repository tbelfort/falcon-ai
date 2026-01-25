import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { IssueDto, LabelDto } from '../api/types';
import { useIssuesStore } from '../stores/issuesStore';
import { assertNever } from '../utils/assertNever';
import { formatStage, formatTimestamp } from '../utils/format';
import { LabelPicker } from './LabelPicker';

interface IssueModalProps {
  issue: IssueDto;
  labels: LabelDto[];
  onClose: () => void;
}

export function IssueModal({ issue, labels, onClose }: IssueModalProps) {
  const commentsState = useIssuesStore((state) => state.commentsByIssueId[issue.id] ?? { status: 'idle' });
  const loadComments = useIssuesStore((state) => state.loadComments);
  const addComment = useIssuesStore((state) => state.addComment);
  const updateIssueLabels = useIssuesStore((state) => state.updateIssueLabels);

  const [commentInput, setCommentInput] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState(() => issue.labels.map((label) => label.id));

  useEffect(() => {
    setSelectedLabelIds(issue.labels.map((label) => label.id));
  }, [issue.id, issue.labels]);

  useEffect(() => {
    void loadComments(issue.id);
  }, [issue.id, loadComments]);

  const commentCount = useMemo(() => {
    if (commentsState.status === 'success') {
      return commentsState.data.length;
    }
    return 0;
  }, [commentsState]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = commentInput.trim();
    if (!trimmed) {
      return;
    }
    await addComment(issue.id, trimmed);
    setCommentInput('');
  };

  const handleToggleLabel = (labelId: string) => {
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId];
    setSelectedLabelIds(next);
    void updateIssueLabels(issue.id, next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-panel max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/70 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-600">
              {formatStage(issue.stage)} · #{issue.number}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink-900">{issue.title}</h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4">
              <h3 className="text-sm font-semibold text-ink-700">Description</h3>
              <p className="mt-2 text-sm text-ink-600">
                {issue.description ?? 'No description provided yet.'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4">
              <h3 className="text-sm font-semibold text-ink-700">Comments ({commentCount})</h3>
              <div className="mt-3 space-y-3">
                {(() => {
                  switch (commentsState.status) {
                    case 'idle':
                    case 'loading':
                      return <p className="text-sm text-ink-500">Loading comments...</p>;
                    case 'error':
                      return <p className="text-sm text-rose-600">{commentsState.error}</p>;
                    case 'success':
                      if (commentsState.data.length === 0) {
                        return <p className="text-sm text-ink-500">No comments yet.</p>;
                      }
                      return commentsState.data.map((comment) => (
                        <div key={comment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center justify-between text-xs text-ink-500">
                            <span>
                              {comment.authorName} · {comment.authorType}
                            </span>
                            <span>{formatTimestamp(comment.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm text-ink-700">{comment.content}</p>
                        </div>
                      ));
                    default:
                      return assertNever(commentsState);
                  }
                })()}
              </div>
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
                <textarea
                  value={commentInput}
                  onChange={(event) => setCommentInput(event.target.value)}
                  className="min-h-[80px] rounded-xl border border-slate-200 bg-white/90 p-2 text-sm text-ink-700"
                  placeholder="Add a comment"
                />
                <button
                  type="submit"
                  className="self-end rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                >
                  Add Comment
                </button>
              </form>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4">
              <h3 className="text-sm font-semibold text-ink-700">Labels</h3>
              <div className="mt-3">
                {labels.length === 0 ? (
                  <p className="text-sm text-ink-500">No labels available.</p>
                ) : (
                  <LabelPicker
                    labels={labels}
                    selectedLabelIds={selectedLabelIds}
                    onToggle={handleToggleLabel}
                  />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4">
              <h3 className="text-sm font-semibold text-ink-700">Assigned Agent</h3>
              <p className="mt-2 text-sm text-ink-600">
                {issue.assignedAgentId ?? 'Unassigned'}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
