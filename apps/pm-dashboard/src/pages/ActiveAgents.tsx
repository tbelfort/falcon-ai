import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOrchestratorStatus } from '@/api/client';
import type { AgentOutputEvent, OrchestratorStatusDto, WsServerMessage } from '@/api/types';
import { DebugOutputPanel } from '@/components/DebugOutputPanel';
import { StageBadge } from '@/components/StageBadge';
import { useWebSocket, type WebSocketTransport } from '@/hooks/useWebSocket';
import { useIssuesStore } from '@/stores/issues';
import { useProjectStore } from '@/stores/projects';
import type { AsyncState } from '@/stores/types';
import { errorState, idleState, loadingState, successState } from '@/stores/types';
import { resolveWsUrl } from '@/utils/websocket';

type ActiveAgentsProps = {
  transport?: WebSocketTransport;
};

function isAgentOutputEvent(data: unknown): data is AgentOutputEvent {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate.runId === 'string' &&
    typeof candidate.agentId === 'string' &&
    typeof candidate.issueId === 'string' &&
    typeof candidate.at === 'number' &&
    typeof candidate.line === 'string'
  );
}

export function ActiveAgents({ transport }: ActiveAgentsProps) {
  const [statusState, setStatusState] = useState<AsyncState<OrchestratorStatusDto>>(idleState);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [outputByRunId, setOutputByRunId] = useState<Record<string, AgentOutputEvent[]>>({});
  const { selectedProjectId } = useProjectStore();
  const { issues, loadIssues } = useIssuesStore();

  const loadStatus = useCallback(async () => {
    setStatusState(loadingState);
    try {
      const status = await fetchOrchestratorStatus();
      setStatusState(successState(status));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load orchestrator status';
      setStatusState(errorState(message));
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!selectedProjectId || issues.status !== 'idle') {
      return;
    }
    loadIssues(selectedProjectId);
  }, [selectedProjectId, issues.status, loadIssues]);

  const activeAgents: OrchestratorStatusDto['activeAgents'] =
    statusState.status === 'success' ? statusState.data.activeAgents : [];

  useEffect(() => {
    if (activeAgents.length === 0) {
      return;
    }
    if (!selectedAgentId || !activeAgents.some((agent) => agent.agentId === selectedAgentId)) {
      setSelectedAgentId(activeAgents[0].agentId);
    }
  }, [activeAgents, selectedAgentId]);

  const issueLookup = useMemo(() => {
    if (issues.status !== 'success') {
      return new Map();
    }
    return new Map(issues.data.map((issue) => [issue.id, issue]));
  }, [issues]);

  const selectedAgent = activeAgents.find((agent) => agent.agentId === selectedAgentId) ?? null;
  const runId = selectedAgent?.issueId ?? null;
  const selectedIssue = selectedAgent ? issueLookup.get(selectedAgent.issueId) : undefined;

  const wsUrl = useMemo(() => resolveWsUrl(), []);
  const handleWsEvent = useCallback((message: WsServerMessage) => {
    if (message.type !== 'event' || message.event !== 'agent.output') {
      return;
    }
    const payload = message.data;
    if (!isAgentOutputEvent(payload)) {
      return;
    }
    if (message.channel !== `run:${payload.runId}`) {
      return;
    }
    setOutputByRunId((prev: Record<string, AgentOutputEvent[]>) => {
      const existing = prev[payload.runId] ?? [];
      const next = [...existing, payload].slice(-200);
      return { ...prev, [payload.runId]: next };
    });
  }, []);

  useWebSocket({
    url: runId ? wsUrl : null,
    onEvent: handleWsEvent,
    subscriptions: runId ? [`run:${runId}`] : [],
    enableInTest: Boolean(transport),
    transport,
  });

  const runOutput = runId ? outputByRunId[runId] ?? [] : [];
  const agentLabel = selectedAgent ? `Agent ${selectedAgent.agentId}` : null;
  const issueLabel = selectedIssue
    ? `Issue #${selectedIssue.number} ${selectedIssue.title}`
    : selectedAgent
      ? `Issue ${selectedAgent.issueId}`
      : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-steel">Orchestrator</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Active Agents</h2>
        </div>
        <button
          type="button"
          className="rounded-full border border-[rgba(27,27,22,0.2)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel"
          onClick={loadStatus}
        >
          Refresh
        </button>
      </div>

      {statusState.status === 'loading' && (
        <div className="rounded-3xl border border-dashed border-[rgba(27,27,22,0.2)] p-6 text-sm text-steel">
          Loading orchestrator status...
        </div>
      )}

      {statusState.status === 'error' && (
        <div className="rounded-3xl border border-dashed border-[rgba(198,92,74,0.4)] bg-[rgba(198,92,74,0.08)] p-6 text-sm text-[var(--rose)]">
          {statusState.error}
        </div>
      )}

      {statusState.status === 'success' && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="surface rounded-3xl p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-steel">Status</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">
              {statusState.data.running ? 'Running' : 'Paused'}
            </h3>
          </div>
          <div className="surface rounded-3xl p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-steel">Active Issues</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">{statusState.data.activeIssues}</h3>
          </div>
          <div className="surface rounded-3xl p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-steel">Queued Issues</p>
            <h3 className="mt-2 text-xl font-semibold text-ink">{statusState.data.queuedIssues}</h3>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-steel">Agents</h3>
          {activeAgents.length === 0 && statusState.status === 'success' && (
            <div className="rounded-3xl border border-dashed border-[rgba(27,27,22,0.2)] p-6 text-sm text-steel">
              No active agents right now.
            </div>
          )}
          {activeAgents.map((agent) => {
            const issue = issueLookup.get(agent.issueId);
            const isSelected = agent.agentId === selectedAgentId;
            return (
              <button
                key={agent.agentId}
                type="button"
                className={`surface w-full rounded-3xl p-5 text-left transition ${
                  isSelected ? 'ring-2 ring-[var(--teal)]' : 'hover:-translate-y-0.5'
                }`}
                onClick={() => setSelectedAgentId(agent.agentId)}
                data-testid={`active-agent-${agent.agentId}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-steel">Agent {agent.agentId}</p>
                    <h4 className="mt-2 text-lg font-semibold text-ink">
                      {issue ? `Issue #${issue.number}` : `Issue ${agent.issueId}`}
                    </h4>
                    <p className="mt-1 text-sm text-steel">{issue?.title ?? 'Unknown issue'}</p>
                  </div>
                  <StageBadge stage={agent.stage} />
                </div>
              </button>
            );
          })}
        </div>

        <DebugOutputPanel
          runId={runId}
          agentLabel={agentLabel}
          issueLabel={issueLabel}
          output={runOutput}
          isStreaming={Boolean(runId)}
        />
      </div>
    </section>
  );
}
