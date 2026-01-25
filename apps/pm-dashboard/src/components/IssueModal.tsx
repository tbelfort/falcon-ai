import { useEffect, useState } from 'react';
import type { IssueStage, LabelDto } from '../types';
import { useIssueStore } from '../stores/issueStore';
import { useUIStore } from '../stores/uiStore';

interface IssueModalProps {
  issueId: string;
}

const STAGE_LABELS: Record<IssueStage, string> = {
  BACKLOG: 'Backlog',
  TODO: 'Todo',
  CONTEXT_PACK: 'Context Pack',
  CONTEXT_REVIEW: 'Context Review',
  SPEC: 'Spec',
  SPEC_REVIEW: 'Spec Review',
  IMPLEMENT: 'Implement',
  PR_REVIEW: 'PR Review',
  PR_HUMAN_REVIEW: 'Human Review',
  FIXER: 'Fixer',
  TESTING: 'Testing',
  DOC_REVIEW: 'Doc Review',
  MERGE_READY: 'Merge Ready',
  DONE: 'Done',
};

export function IssueModal({ issueId }: IssueModalProps) {
  const { issues, labels, comments, fetchComments, addComment, updateIssueLabels } =
    useIssueStore();
  const selectIssue = useUIStore((s) => s.selectIssue);

  const [newComment, setNewComment] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const issue = issues.find((i) => i.id === issueId);
  const issueComments = comments[issueId] || [];

  useEffect(() => {
    fetchComments(issueId);
  }, [issueId, fetchComments]);

  if (!issue) {
    return null;
  }

  const handleClose = () => {
    selectIssue(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    await addComment(issueId, newComment.trim(), authorName.trim() || undefined);
    setNewComment('');
    setSubmitting(false);
  };

  const handleLabelToggle = async (label: LabelDto) => {
    const currentLabelIds = issue.labels.map((l) => l.id);
    const newLabelIds = currentLabelIds.includes(label.id)
      ? currentLabelIds.filter((id) => id !== label.id)
      : [...currentLabelIds, label.id];

    await updateIssueLabels(issueId, newLabelIds);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={handleBackdropClick}
      data-testid="issue-modal"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-700 p-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>#{issue.number}</span>
              <span className="rounded bg-gray-700 px-2 py-0.5 text-xs">
                {STAGE_LABELS[issue.stage]}
              </span>
              {issue.assignedAgentId && (
                <span className="rounded bg-purple-900 px-2 py-0.5 text-xs text-purple-300">
                  {issue.assignedAgentId}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">{issue.title}</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Description */}
        <div className="border-b border-gray-700 p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-300">Description</h3>
          {issue.description ? (
            <p className="whitespace-pre-wrap text-sm text-gray-400">
              {issue.description}
            </p>
          ) : (
            <p className="text-sm italic text-gray-500">No description</p>
          )}
        </div>

        {/* Labels */}
        <div className="border-b border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">Labels</h3>
            <button
              onClick={() => setShowLabelPicker(!showLabelPicker)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {showLabelPicker ? 'Done' : 'Edit'}
            </button>
          </div>

          {showLabelPicker ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {labels.map((label) => {
                const isSelected = issue.labels.some((l) => l.id === label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => handleLabelToggle(label)}
                    className={`rounded px-2 py-1 text-xs ${
                      isSelected
                        ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800'
                        : 'opacity-50 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: `${label.color}40`,
                      color: label.color,
                    }}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {issue.labels.length > 0 ? (
                issue.labels.map((label) => (
                  <span
                    key={label.id}
                    className="rounded px-2 py-1 text-xs"
                    style={{
                      backgroundColor: `${label.color}40`,
                      color: label.color,
                    }}
                  >
                    {label.name}
                  </span>
                ))
              ) : (
                <span className="text-sm italic text-gray-500">No labels</span>
              )}
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-300">
            Comments ({issueComments.length})
          </h3>

          <div className="space-y-3">
            {issueComments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-gray-700 bg-gray-850 p-3"
                data-testid={`comment-${comment.id}`}
              >
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      comment.authorType === 'agent'
                        ? 'bg-purple-900 text-purple-300'
                        : 'bg-blue-900 text-blue-300'
                    }`}
                  >
                    {comment.authorType}
                  </span>
                  <span className="font-medium text-gray-400">
                    {comment.authorName}
                  </span>
                  <span>{formatDate(comment.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">
                  {comment.content}
                </p>
              </div>
            ))}

            {issueComments.length === 0 && (
              <p className="text-sm italic text-gray-500">No comments yet</p>
            )}
          </div>

          {/* Add Comment Form */}
          <form onSubmit={handleSubmitComment} className="mt-4">
            <div className="mb-2">
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Your name (optional)"
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              rows={3}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
