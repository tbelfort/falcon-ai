import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { fetchIssueFindings, launchFixer, reviewFinding } from '@/api/client';
import type { FindingDto, FindingStatus, FindingsSummary, IssueFindingsDto } from '@/api/types';
import { FindingCard } from '@/components/FindingCard';
import { useIssuesStore } from '@/stores/issues';
import { useProjectStore } from '@/stores/projects';
import type { AsyncState } from '@/stores/types';
import { errorState, idleState, loadingState, successState } from '@/stores/types';

type FindingWithComment = FindingDto & { reviewComment?: string };

type FindingsPayload = Omit<IssueFindingsDto, 'findings' | 'summary'> & { findings: FindingWithComment[] };

export function PRReview() {
  const { selectedProjectId } = useProjectStore();
  const { issues, loadIssues } = useIssuesStore();
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [findingsState, setFindingsState] = useState<AsyncState<FindingsPayload>>(idleState);
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [launchState, setLaunchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!selectedProjectId || issues.status !== 'idle') {
      return;
    }
    loadIssues(selectedProjectId);
  }, [selectedProjectId, issues.status, loadIssues]);

  useEffect(() => {
    if (issues.status !== 'success') {
      return;
    }
    if (!selectedIssueId && issues.data.length > 0) {
      setSelectedIssueId(issues.data[0].id);
    }
  }, [issues, selectedIssueId]);

  const loadFindings = useCallback(async (issueId: string) => {
    setFindingsState(loadingState);
    setActionError(null);
    setLaunchState('idle');
    try {
      const payload = await fetchIssueFindings(issueId);
      setFindingsState(
        successState({
          prNumber: payload.prNumber,
          prUrl: payload.prUrl,
          findings: payload.findings.map((finding) => ({ ...finding })),
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load findings';
      setFindingsState(errorState(message));
    }
  }, []);

  useEffect(() => {
    if (!selectedIssueId) {
      return;
    }
    loadFindings(selectedIssueId);
  }, [selectedIssueId, loadFindings]);

  const summary = useMemo(() => {
    if (findingsState.status !== 'success') {
      return null;
    }
    const findings = findingsState.data.findings as FindingWithComment[];
    return findings.reduce<FindingsSummary>(
      (acc: FindingsSummary, finding: FindingWithComment) => {
        acc.total += 1;
        if (finding.status === 'pending') {
          acc.pending += 1;
        }
        if (finding.status === 'approved') {
          acc.approved += 1;
        }
        if (finding.status === 'dismissed') {
          acc.dismissed += 1;
        }
        return acc;
      },
      { total: 0, pending: 0, approved: 0, dismissed: 0 },
    );
  }, [findingsState]);

  const handleReview = useCallback(
    async (findingId: string, status: FindingStatus, comment?: string) => {
      setReviewingIds((prev: Set<string>) => new Set(prev).add(findingId));
      setActionError(null);
      try {
        await reviewFinding(findingId, status, comment);
        setFindingsState((state: AsyncState<FindingsPayload>) => {
          if (state.status !== 'success') {
            return state;
          }
          return successState({
            ...state.data,
            findings: state.data.findings.map((finding) =>
              finding.id === findingId
                ? { ...finding, status, reviewComment: comment }
                : finding,
            ),
          });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update finding';
        setActionError(message);
      } finally {
        setReviewingIds((prev: Set<string>) => {
          const next = new Set(prev);
          next.delete(findingId);
          return next;
        });
      }
    },
    [],
  );

  const handleLaunchFixer = useCallback(async () => {
    if (!selectedIssueId) {
      return;
    }
    setLaunchState('loading');
    setActionError(null);
    try {
      await launchFixer(selectedIssueId);
      setLaunchState('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to launch fixer';
      setActionError(message);
      setLaunchState('error');
    }
  }, [selectedIssueId]);

  const canLaunchFixer = Boolean(summary && summary.pending === 0 && findingsState.status === 'success');

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-steel">PR Review</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Findings Gate</h2>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.2em] text-steel">Issue</label>
          <select
            className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2 text-sm"
            value={selectedIssueId ?? ''}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedIssueId(event.target.value)}
          >
            {issues.status === 'success' &&
              issues.data.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  #{issue.number} {issue.title}
                </option>
              ))}
          </select>
        </div>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-[rgba(198,92,74,0.4)] bg-[rgba(198,92,74,0.1)] px-5 py-3 text-sm text-[var(--rose)]">
          {actionError}
        </div>
      )}

      {findingsState.status === 'loading' && (
        <div className="rounded-3xl border border-dashed border-[rgba(27,27,22,0.2)] p-6 text-sm text-steel">
          Loading findings...
        </div>
      )}

      {findingsState.status === 'error' && (
        <div className="rounded-3xl border border-dashed border-[rgba(198,92,74,0.4)] bg-[rgba(198,92,74,0.08)] p-6 text-sm text-[var(--rose)]">
          {findingsState.error}
        </div>
      )}

      {findingsState.status === 'success' && (
        <div className="space-y-6">
          <div className="surface flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-steel">Pull Request</p>
              <h3 className="mt-2 text-xl font-semibold text-ink">#{findingsState.data.prNumber}</h3>
              <a
                className="mt-2 inline-block text-sm text-[var(--teal)] underline"
                href={findingsState.data.prUrl}
                target="_blank"
                rel="noreferrer"
              >
                View PR
              </a>
            </div>
            {summary && (
              <div className="flex flex-wrap gap-3 text-sm text-steel">
                <span className="badge bg-[rgba(27,27,22,0.08)] text-steel">Total {summary.total}</span>
                <span className="badge bg-[rgba(212,123,63,0.15)] text-[var(--clay)]">
                  Pending {summary.pending}
                </span>
                <span className="badge bg-[rgba(31,111,100,0.15)] text-[var(--teal)]">
                  Approved {summary.approved}
                </span>
                <span className="badge bg-[rgba(198,92,74,0.15)] text-[var(--rose)]">
                  Dismissed {summary.dismissed}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.2em] text-steel">
              Findings ({findingsState.data.findings.length})
            </p>
            <button
              type="button"
              className="rounded-full bg-[var(--clay)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
              onClick={handleLaunchFixer}
              disabled={!canLaunchFixer || launchState === 'loading'}
            >
              {launchState === 'loading' ? 'Launching Fixer...' : 'Launch Fixer'}
            </button>
          </div>

          {launchState === 'success' && (
            <div className="rounded-2xl border border-[rgba(31,111,100,0.3)] bg-[rgba(31,111,100,0.08)] px-5 py-3 text-sm text-[var(--teal)]">
              Fixer launched. Monitoring the next run.
            </div>
          )}

          <div className="space-y-4">
            {findingsState.data.findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                onReview={handleReview}
                isUpdating={reviewingIds.has(finding.id)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
