import { useEffect, useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useIssueStore } from '../../stores/issueStore';
import { CommentsList } from './CommentsList';
import { LabelEditor } from './LabelEditor';

export function IssueModal() {
  const { isModalOpen, selectedIssueId, closeIssueModal } = useUiStore();
  const issues = useIssueStore((s) => s.issues);
  const fetchComments = useIssueStore((s) => s.fetchComments);
  const [activeTab, setActiveTab] = useState<'comments' | 'labels'>('comments');

  const issue =
    issues.status === 'success' && selectedIssueId
      ? issues.data.find((i) => i.id === selectedIssueId)
      : null;

  useEffect(() => {
    if (selectedIssueId && isModalOpen) {
      fetchComments(selectedIssueId);
    }
  }, [selectedIssueId, isModalOpen, fetchComments]);

  if (!isModalOpen || !issue) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeIssueModal();
      }}
      data-testid="issue-modal-overlay"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        data-testid="issue-modal"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <span className="font-mono">#{issue.number}</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                {issue.stage}
              </span>
              {issue.assignedAgentId && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                  {issue.assignedAgentId}
                </span>
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{issue.title}</h2>
          </div>
          <button
            onClick={closeIssueModal}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Description */}
        {issue.description && (
          <div className="p-4 border-b">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{issue.description}</p>
          </div>
        )}

        {/* Labels display */}
        {issue.labels.length > 0 && (
          <div className="px-4 py-2 border-b">
            <div className="flex flex-wrap gap-1">
              {issue.labels.map((label) => (
                <span
                  key={label.id}
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: `${label.color}20`,
                    color: label.color,
                  }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b px-4">
          <button
            onClick={() => setActiveTab('comments')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'comments'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Comments
          </button>
          <button
            onClick={() => setActiveTab('labels')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'labels'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Edit Labels
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'comments' && <CommentsList issueId={issue.id} />}
          {activeTab === 'labels' && <LabelEditor issue={issue} />}
        </div>
      </div>
    </div>
  );
}
