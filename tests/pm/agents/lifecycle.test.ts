import { describe, expect, it } from 'vitest';
import {
  beginCheckout,
  createLifecycleState,
  markDone,
  markError,
  markIdle,
  markWorking,
  releaseAgent,
} from '../../../src/pm/agents/lifecycle.js';

describe('lifecycle', () => {
  it('transitions through core lifecycle states', () => {
    const init = createLifecycleState();
    const idle = markIdle(init);
    const checkout = beginCheckout(idle, 'ISSUE-1');
    const working = markWorking(checkout);
    const done = markDone(working);
    const released = releaseAgent(done);

    expect(init.status).toBe('INIT');
    expect(idle.status).toBe('IDLE');
    expect(checkout.status).toBe('CHECKOUT');
    expect(working.status).toBe('WORKING');
    expect(done.status).toBe('DONE');
    expect(released.status).toBe('IDLE');
    expect(released.issueId).toBeNull();
  });

  it('rejects assigning work to a WORKING agent', () => {
    const state = markWorking(beginCheckout(markIdle(createLifecycleState()), 'ISSUE-2'));
    expect(() => beginCheckout(state, 'ISSUE-3')).toThrow(
      'Cannot assign work to a WORKING agent'
    );
  });

  it('allows error transitions from any state', () => {
    const errored = markError(createLifecycleState(), 'boom');
    expect(errored.status).toBe('ERROR');
    expect(errored.lastError).toBe('boom');
  });
});
