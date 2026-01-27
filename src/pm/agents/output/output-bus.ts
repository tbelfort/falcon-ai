import { unixSeconds } from '../../core/utils/time.js';

export interface OutputLine {
  runId: string;
  agentId: string;
  issueId: string;
  at: number;
  line: string;
}

export type OutputListener = (line: OutputLine) => void;

export class OutputBus {
  private listeners = new Map<string, Set<OutputListener>>();

  publish(input: Omit<OutputLine, 'at'>) {
    const payload: OutputLine = { ...input, at: unixSeconds() };
    const listeners = this.listeners.get(payload.runId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      // Wrap listener calls in try/catch to prevent one failing listener
      // from crashing the server or blocking other listeners
      try {
        listener(payload);
      } catch (error) {
        console.error('[OutputBus] Listener error:', error);
      }
    }
  }

  subscribe(runId: string, listener: OutputListener): () => void {
    const existing = this.listeners.get(runId);
    if (existing) {
      existing.add(listener);
    } else {
      this.listeners.set(runId, new Set([listener]));
    }

    return () => {
      const set = this.listeners.get(runId);
      if (!set) {
        return;
      }

      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }
}

export const defaultOutputBus = new OutputBus();
