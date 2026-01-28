import { useEffect, useState } from 'react';
import type { FindingDto, FindingStatus } from '@/api/types';

type FindingWithComment = FindingDto & { reviewComment?: string };

interface FindingCardProps {
  finding: FindingWithComment;
  onReview: (findingId: string, status: FindingStatus, comment?: string) => Promise<void>;
  isUpdating?: boolean;
}

const STATUS_TONES: Record<FindingStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-[rgba(212,123,63,0.15)]', text: 'text-[var(--clay)]' },
  approved: { bg: 'bg-[rgba(31,111,100,0.15)]', text: 'text-[var(--teal)]' },
  dismissed: { bg: 'bg-[rgba(198,92,74,0.15)]', text: 'text-[var(--rose)]' },
};

export function FindingCard({ finding, onReview, isUpdating }: FindingCardProps) {
  const [comment, setComment] = useState(finding.reviewComment ?? '');

  useEffect(() => {
    setComment(finding.reviewComment ?? '');
  }, [finding.reviewComment, finding.id]);

  const handleReview = async (status: FindingStatus) => {
    const trimmed = comment.trim();
    await onReview(finding.id, status, trimmed ? trimmed : undefined);
  };

  const isPending = finding.status === 'pending';
  const statusTone = STATUS_TONES[finding.status];

  return (
    <article className="surface rounded-3xl p-6" data-testid={`finding-card-${finding.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-steel">{finding.category}</p>
          <h3 className="mt-2 text-lg font-semibold text-ink">{finding.message}</h3>
          <p className="mt-2 text-sm text-steel">
            {finding.filePath}:{finding.lineNumber}
          </p>
        </div>
        <span className={`badge ${statusTone.bg} ${statusTone.text}`}>{finding.status}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-steel">
        <span>{finding.findingType}</span>
        <span>Confidence {Math.round(finding.confidence * 100)}%</span>
        <span>Scout {finding.foundBy}</span>
        <span>Judge {finding.confirmedBy}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-[rgba(27,27,22,0.1)] bg-white/70 p-4 text-sm text-ink">
        <p className="text-xs uppercase tracking-[0.2em] text-steel">Suggestion</p>
        <p className="mt-2">{finding.suggestion}</p>
      </div>

      <div className="mt-5">
        <label className="text-xs uppercase tracking-[0.2em] text-steel">Review Comment</label>
        <textarea
          className="mt-2 min-h-[90px] w-full rounded-2xl border border-[rgba(27,27,22,0.15)] bg-white px-4 py-3 text-sm"
          placeholder="Optional reviewer note"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={!isPending || isUpdating}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-full bg-[var(--teal)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
          onClick={() => handleReview('approved')}
          disabled={!isPending || isUpdating}
        >
          Approve
        </button>
        <button
          type="button"
          className="rounded-full border border-[rgba(198,92,74,0.5)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--rose)] disabled:opacity-50"
          onClick={() => handleReview('dismissed')}
          disabled={!isPending || isUpdating}
        >
          Dismiss
        </button>
      </div>
    </article>
  );
}
