import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useIssuesStore } from '../stores/issuesStore';
import { useProjectsStore } from '../stores/projectsStore';
import { createSafeAbortController } from '../utils/abort';
import { getStageLabel } from '../utils/stages';
import LabelsEditor from './LabelsEditor';
import StageBadge from './StageBadge';

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

type IssueModalProps = {
  issueId: string;
  onClose: () => void;
};

export default function IssueModal({ issueId, onClose }: IssueModalProps) {
  const issue = useIssuesStore((state) => {
    for (const project of Object.values(state.issuesByProject)) {
      if (project.status !== 'success') {
        continue;
      }
      const found = project.data.find((item) => item.id === issueId);
      if (found) {
        return found;
      }
    }
    return undefined;
  });

  const commentsState = useIssuesStore((state) => state.commentsByIssue[issueId]);
  const loadComments = useIssuesStore((state) => state.loadComments);
  const addComment = useIssuesStore((state) => state.addComment);
  const updateIssueLabels = useIssuesStore((state) => state.updateIssueLabels);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const labelsState = useIssuesStore((state) =>
    activeProjectId ? state.labelsByProject[activeProjectId] : undefined
  );
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    if (!issueId) {
      return undefined;
    }
    const controller = createSafeAbortController();
    loadComments(issueId, controller?.signal);
    return () => controller?.abort();
  }, [issueId, loadComments]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const comments = commentsState?.status === 'success' ? commentsState.data : [];
  const labels = labelsState?.status === 'success' ? labelsState.data : [];

  const selectedLabelIds = useMemo(() => {
    if (!issue) {
      return [];
    }
    return issue.labels.map((label) => label.id);
  }, [issue]);

  if (!issue) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!commentDraft.trim()) {
      return;
    }
    await addComment(issue.id, commentDraft.trim());
    setCommentDraft('');
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel app-shell" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-6 border-b border-[var(--stroke)] px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Issue #{issue.number}
            </p>
            <h2 className="text-2xl font-semibold text-[var(--ink)]">{issue.title}</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">{getStageLabel(issue.stage)}</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StageBadge stage={issue.stage} />
            <button
              type="button"
              className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-6 px-8 py-6 lg:grid-cols-[2fr_1fr]">
          <section className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Description
              </h3>
              <p className="mt-2 text-sm text-[var(--ink)]">
                {issue.description ?? 'No description provided.'}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Comments
              </h3>
              <div className="mt-3 space-y-3">
                {commentsState?.status === 'loading' && (
                  <p className="text-sm text-[var(--ink-muted)]">Loading comments...</p>
                )}
                {comments.length === 0 && commentsState?.status !== 'loading' && (
                  <p className="text-sm text-[var(--ink-muted)]">No comments yet.</p>
                )}
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-[var(--stroke)] p-3">
                    <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                      <span>{comment.authorName}</span>
                      <span>{formatTimestamp(comment.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--ink)]">{comment.content}</p>
                  </div>
                ))}
              </div>
              <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-[var(--stroke)] bg-white p-3 text-sm text-[var(--ink)] shadow-sm focus:border-[var(--accent-2)] focus:outline-none"
                  placeholder="Leave a comment for the team..."
                />
                <button
                  type="submit"
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                >
                  Add comment
                </button>
              </form>
            </div>
          </section>

          <aside className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Labels
              </h3>
              <div className="mt-3">
                {labelsState?.status === 'loading' ? (
                  <p className="text-sm text-[var(--ink-muted)]">Loading labels...</p>
                ) : (
                  <LabelsEditor
                    labels={labels}
                    selectedLabelIds={selectedLabelIds}
                    onChange={(nextIds) => updateIssueLabels(issue.id, nextIds)}
                  />
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Assigned agent
              </h3>
              <p className="mt-2 text-sm text-[var(--ink)]">
                {issue.assignedAgentId ?? 'Unassigned'}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
