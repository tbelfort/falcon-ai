import { useState } from 'react';
import { useIssueStore } from '../../stores/issueStore';
import { useUiStore } from '../../stores/uiStore';
import { ApiClientError } from '../../api/client';

interface CommentsListProps {
  issueId: string;
}

export function CommentsList({ issueId }: CommentsListProps) {
  const comments = useIssueStore((s) => s.comments);
  const addComment = useIssueStore((s) => s.addComment);
  const showError = useUiStore((s) => s.showError);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment(issueId, newComment.trim(), 'User');
      setNewComment('');
    } catch (e) {
      const message =
        e instanceof ApiClientError ? e.message : 'Failed to add comment';
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (comments.status === 'loading') {
    return <div className="text-gray-500 text-sm">Loading comments...</div>;
  }

  if (comments.status === 'error') {
    return <div className="text-red-500 text-sm">{comments.error}</div>;
  }

  if (comments.status !== 'success') {
    return null;
  }

  return (
    <div className="space-y-4" data-testid="comments-list">
      {/* Comments */}
      {comments.data.length === 0 ? (
        <div className="text-gray-500 text-sm">No comments yet</div>
      ) : (
        <div className="space-y-3">
          {comments.data.map((comment) => (
            <div
              key={comment.id}
              className="bg-gray-50 rounded-lg p-3"
              data-testid={`comment-${comment.id}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    comment.authorType === 'agent'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {comment.authorType}
                </span>
                <span className="text-sm font-medium text-gray-700">
                  {comment.authorName}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDate(comment.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add comment form */}
      <form onSubmit={handleSubmit} className="mt-4">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
          data-testid="comment-input"
        />
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={!newComment.trim() || isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="submit-comment"
          >
            {isSubmitting ? 'Adding...' : 'Add Comment'}
          </button>
        </div>
      </form>
    </div>
  );
}
