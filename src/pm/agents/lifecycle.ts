import type { AgentStatus } from './registry.js';

export interface AgentLifecycleState {
  status: AgentStatus;
  issueId: string | null;
  lastError?: string | null;
}

function assertStatus(
  state: AgentLifecycleState,
  allowed: AgentStatus[],
  target: AgentStatus
): void {
  if (!allowed.includes(state.status)) {
    throw new Error(`Invalid transition to ${target} from ${state.status}`);
  }
}

export function createLifecycleState(): AgentLifecycleState {
  return { status: 'INIT', issueId: null, lastError: null };
}

export function markIdle(state: AgentLifecycleState): AgentLifecycleState {
  assertStatus(state, ['INIT', 'DONE', 'ERROR'], 'IDLE');
  return { status: 'IDLE', issueId: null, lastError: null };
}

export function beginCheckout(
  state: AgentLifecycleState,
  issueId: string
): AgentLifecycleState {
  if (state.status === 'WORKING') {
    throw new Error('Cannot assign work to a WORKING agent');
  }
  assertStatus(state, ['IDLE'], 'CHECKOUT');
  return { status: 'CHECKOUT', issueId, lastError: null };
}

export function markWorking(state: AgentLifecycleState): AgentLifecycleState {
  assertStatus(state, ['CHECKOUT'], 'WORKING');
  return { ...state, status: 'WORKING' };
}

export function markDone(state: AgentLifecycleState): AgentLifecycleState {
  assertStatus(state, ['WORKING'], 'DONE');
  return { ...state, status: 'DONE' };
}

export function markError(
  state: AgentLifecycleState,
  message?: string
): AgentLifecycleState {
  return { ...state, status: 'ERROR', lastError: message ?? null };
}

export function releaseAgent(state: AgentLifecycleState): AgentLifecycleState {
  assertStatus(state, ['DONE', 'ERROR'], 'IDLE');
  return { status: 'IDLE', issueId: null, lastError: null };
}
