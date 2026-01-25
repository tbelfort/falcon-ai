import { useEffect, useState, useCallback } from 'react';
import type { IssueDto, LabelDto } from '../types';
import { useIssueStore } from '../stores/issueStore';
import { useProjectStore } from '../stores/projectStore';
import { useUiStore } from '../stores/uiStore';

const STAGE_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To Do',
  CONTEXT_PACK: 'Context Pack',
  CONTEXT_REVIEW: 'Context Review',
  SPEC: 'Spec',
  SPEC_REVIEW: 'Spec Review',
  IMPLEMENT: 'Implement',
  PR_REVIEW: 'PR Review',
  PR_HUMAN_REVIEW: 'PR Human Review',
  FIXER: 'Fixer',
  TESTING: 'Testing',
  DOC_REVIEW: 'Doc Review',
  MERGE_READY: 'Merge Ready',
  DONE: 'Done',
};

export function IssueModal() {
  const { isModalOpen, modalIssueId, closeModal } = useUiStore();
  const { issues, comments, selectIssue, addComment, updateIssueLabels } = useIssueStore();
  const { labels } = useProjectStore();
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLabelEditor, setShowLabelEditor] = useState(false);

  useEffect(() => {
    if (modalIssueId) {
      selectIssue(modalIssueId);
    }
  }, [modalIssueId, selectIssue]);

  const handleClose = useCallback(() => {
    closeModal();
    selectIssue(null);
    setNewComment('');
    setShowLabelEditor(false);
  }, [closeModal, selectIssue]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalIssueId || !newComment.trim()) return;

    setIsSubmitting(true);
    try {
      await addComment(modalIssueId, newComment.trim());
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleLabel = async (label: LabelDto) => {
    if (!issue) return;
    const currentLabelIds = issue.labels.map((l) => l.id);
    const hasLabel = currentLabelIds.includes(label.id);
    const newLabelIds = hasLabel
      ? currentLabelIds.filter((id) => id !== label.id)
      : [...currentLabelIds, label.id];
    await updateIssueLabels(issue.id, newLabelIds);
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, handleClose]);

  if (!isModalOpen || !modalIssueId) return null;

  const issue: IssueDto | undefined =
    issues.status === 'success'
      ? issues.data.find((i) => i.id === modalIssueId)
      : undefined;

  if (!issue) return null;

  const allLabels: LabelDto[] = labels.status === 'success' ? labels.data : [];
  const issueLabelIds = new Set(issue.labels.map((l) => l.id));

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <div className="text-sm text-gray-500 mb-1">#{issue.number}</div>
            <h2 className="text-xl font-semibold text-gray-900">{issue.title}</h2>
            <div className="mt-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {STAGE_LABELS[issue.stage] ?? issue.stage}
              </span>
              {issue.assignedAgentId && (
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Agent: {issue.assignedAgentId}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
            <div className="text-sm text-gray-600 bg-gray-50 rounded p-3">
              {issue.description || <span className="italic text-gray-400">No description</span>}
            </div>
          </div>

          {/* Labels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Labels</h3>
              <button
                onClick={() => setShowLabelEditor(!showLabelEditor)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showLabelEditor ? 'Done' : 'Edit'}
              </button>
            </div>
            {showLabelEditor ? (
              <div className="flex flex-wrap gap-2">
                {allLabels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => handleToggleLabel(label)}
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border transition-all ${
                      issueLabelIds.has(label.id)
                        ? 'ring-2 ring-offset-1'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: `${label.color}20`,
                      color: label.color,
                      borderColor: label.color,
                      ...(issueLabelIds.has(label.id) ? { ringColor: label.color } : {}),
                    }}
                  >
                    {issueLabelIds.has(label.id) && (
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {label.name}
                  </button>
                ))}
                {allLabels.length === 0 && (
                  <span className="text-sm text-gray-400 italic">No labels available</span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {issue.labels.length > 0 ? (
                  issue.labels.map((label) => (
                    <span
                      key={label.id}
                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${label.color}20`,
                        color: label.color,
                      }}
                    >
                      {label.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-400 italic">No labels</span>
                )}
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Comments</h3>
            <div className="space-y-3">
              {comments.status === 'loading' && (
                <div className="text-sm text-gray-500">Loading comments...</div>
              )}
              {comments.status === 'error' && (
                <div className="text-sm text-red-500">Failed to load comments</div>
              )}
              {comments.status === 'success' && comments.data.length === 0 && (
                <div className="text-sm text-gray-400 italic">No comments yet</div>
              )}
              {comments.status === 'success' &&
                comments.data.map((comment) => (
                  <div
                    key={comment.id}
                    className="bg-gray-50 rounded p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          comment.authorType === 'agent'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {comment.authorName}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-gray-600 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
            </div>

            {/* Add comment form */}
            <form onSubmit={handleSubmitComment} className="mt-4">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Add Comment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
