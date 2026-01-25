import { useEffect, useMemo, useState } from 'react';
import type { CommentDto, IssueDto, LabelDto } from '../api/types';
import { addComment, fetchComments } from '../api/client';
import { getErrorMessage, isAbortError } from '../api/errors';
import type { AsyncState } from '../utils/asyncState';
import { assertNever } from '../utils/assertNever';
import { LabelPill } from './LabelPill';
import { Modal } from './Modal';
import { StageBadge } from './StageBadge';

interface IssueModalProps {
  issue: IssueDto | null;
  labelsState: AsyncState<LabelDto[]>;
  onClose: () => void;
  onUpdateLabels: (issueId: string, labelIds: string[]) => void;
}

export function IssueModal({ issue, labelsState, onClose, onUpdateLabels }: IssueModalProps) {
  const [commentsState, setCommentsState] = useState<AsyncState<CommentDto[]>>({ status: 'idle' });
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialLabelIds = useMemo(() => new Set(issue?.labels.map((label) => label.id) ?? []), [issue]);
  const [selectedLabelIds, setSelectedLabelIds] = useState(initialLabelIds);

  useEffect(() => {
    setSelectedLabelIds(new Set(issue?.labels.map((label) => label.id) ?? []));
  }, [issue?.id, issue?.labels]);

  useEffect(() => {
    if (!issue) {
      return;
    }
    const allowAbort = import.meta.env.MODE !== 'test';
    const controller = allowAbort ? new AbortController() : null;
    setCommentsState({ status: 'loading' });
    fetchComments(issue.id, controller?.signal)
      .then((comments) => setCommentsState({ status: 'success', data: comments }))
      .catch((error) => {
        if (isAbortError(error)) {
          return;
        }
        setCommentsState({ status: 'error', error: getErrorMessage(error) });
      });

    return () => controller?.abort();
  }, [issue?.id]);

  if (!issue) {
    return null;
  }

  const handleToggleLabel = (labelId: string) => {
    const next = new Set(selectedLabelIds);
    if (next.has(labelId)) {
      next.delete(labelId);
    } else {
      next.add(labelId);
    }
    setSelectedLabelIds(next);
    onUpdateLabels(issue.id, Array.from(next));
  };

  const handleAddComment = async () => {
    if (!draft.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await addComment(issue.id, draft.trim(), 'Falcon PM');
      setDraft('');
      setCommentsState((state) => {
        if (state.status !== 'success') {
          return { status: 'success', data: [created] };
        }
        return { status: 'success', data: [...state.data, created] };
      });
    } catch (error) {
      setCommentsState({ status: 'error', error: getErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={Boolean(issue)} title={issue.title} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-400">Issue</p>
            <h2 className="text-2xl font-semibold text-ink-900">{issue.title}</h2>
            <p className="text-xs text-ink-500">#{issue.number}</p>
          </div>
          <StageBadge stage={issue.stage} />
        </div>

        <section className="rounded-2xl border border-ink-100/60 bg-white/80 p-4">
          <h3 className="text-sm font-semibold text-ink-800">Description</h3>
          <p className="mt-2 text-sm text-ink-600">
            {issue.description ?? 'No description yet.'}
          </p>
        </section>

        <section className="rounded-2xl border border-ink-100/60 bg-white/80 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-800">Labels</h3>
            <div className="flex flex-wrap gap-2">
              {issue.labels.map((label) => (
                <LabelPill key={label.id} label={label} />
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {labelsState.status === 'success' ? (
              labelsState.data.map((label) => (
                <label
                  key={label.id}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-ink-100/70 bg-white/70 px-3 py-2 text-sm text-ink-700"
                >
                  <span>{label.name}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-coral-500"
                    checked={selectedLabelIds.has(label.id)}
                    onChange={() => handleToggleLabel(label.id)}
                  />
                </label>
              ))
            ) : labelsState.status === 'loading' ? (
              <p className="text-sm text-ink-400">Loading labels...</p>
            ) : labelsState.status === 'error' ? (
              <p className="text-sm text-rose-600">{labelsState.error}</p>
            ) : labelsState.status === 'idle' ? (
              <p className="text-sm text-ink-400">No labels loaded.</p>
            ) : (
              assertNever(labelsState)
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-100/60 bg-white/80 p-4">
          <h3 className="text-sm font-semibold text-ink-800">Comments</h3>
          <div className="mt-3 flex flex-col gap-3">
            {commentsState.status === 'loading' ? (
              <p className="text-sm text-ink-400">Loading comments...</p>
            ) : commentsState.status === 'error' ? (
              <p className="text-sm text-rose-600">{commentsState.error}</p>
            ) : commentsState.status === 'success' && commentsState.data.length === 0 ? (
              <p className="text-sm text-ink-400">No comments yet.</p>
            ) : commentsState.status === 'success' ? (
              commentsState.data.map((comment) => (
                <div key={comment.id} className="rounded-xl border border-ink-100/70 bg-white/80 p-3">
                  <div className="flex items-center justify-between text-xs text-ink-400">
                    <span>{comment.authorName}</span>
                    <span>{new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-700">{comment.content}</p>
                </div>
              ))
            ) : commentsState.status === 'idle' ? (
              <p className="text-sm text-ink-400">Comments will load when opened.</p>
            ) : (
              assertNever(commentsState)
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-ink-200/70 bg-white/90 p-3 text-sm text-ink-700 focus:border-coral-400 focus:outline-none focus:ring-2 focus:ring-coral-200"
              placeholder="Add a comment..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex justify-end">
              <button
                className="rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-300"
                type="button"
                onClick={() => void handleAddComment()}
                disabled={isSubmitting || !draft.trim()}
              >
                {isSubmitting ? 'Sending...' : 'Add Comment'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
