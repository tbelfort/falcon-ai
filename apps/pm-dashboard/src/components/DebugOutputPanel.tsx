import { useEffect, useRef } from 'react';
import type { AgentOutputEvent } from '@/api/types';

interface DebugOutputPanelProps {
  runId: string | null;
  agentLabel?: string | null;
  issueLabel?: string | null;
  output: AgentOutputEvent[];
  isStreaming: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

export function DebugOutputPanel({
  runId,
  agentLabel,
  issueLabel,
  output,
  isStreaming,
}: DebugOutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [output]);

  return (
    <section className="surface rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-steel">Debug Output</p>
          <h3 className="mt-2 text-xl font-semibold text-ink">
            {runId ? `Run ${runId}` : 'Select an agent to stream output'}
          </h3>
          {(agentLabel || issueLabel) && (
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-steel">
              {[agentLabel, issueLabel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <span
          className={`badge ${isStreaming ? 'bg-[var(--teal-soft)] text-[var(--teal)]' : 'bg-[rgba(27,27,22,0.08)] text-steel'}`}
        >
          {isStreaming ? 'Streaming' : 'Idle'}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="mt-5 h-72 overflow-y-auto rounded-2xl border border-[rgba(27,27,22,0.15)] bg-[rgba(20,20,16,0.92)] p-4 text-xs text-slate-100"
      >
        {!runId && (
          <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.2)] p-4 text-xs text-slate-300">
            Pick an active agent to view live output.
          </div>
        )}
        {runId && output.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.2)] p-4 text-xs text-slate-300">
            Waiting for output events...
          </div>
        )}
        {runId && output.length > 0 && (
          <div className="space-y-2">
            {output.map((entry, index) => (
              <div key={`${entry.runId}-${entry.agentId}-${entry.at}-${index}`} className="flex gap-3">
                <span className="w-20 shrink-0 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  {formatTime(entry.at)}
                </span>
                <span className="w-20 shrink-0 text-[11px] text-slate-300">{entry.agentId}</span>
                <span className="flex-1 text-[13px] text-slate-50">{entry.line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
