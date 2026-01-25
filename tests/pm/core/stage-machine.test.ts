import { describe, expect, it } from 'vitest';
import { canTransition, STAGE_TRANSITIONS } from '../../../src/pm/core/stage-machine.js';

describe('stage machine', () => {
  it('allows expected transitions', () => {
    expect(canTransition('BACKLOG', 'TODO')).toBe(true);
    expect(canTransition('TODO', 'CONTEXT_PACK')).toBe(true);
    expect(canTransition('CONTEXT_REVIEW', 'SPEC')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransition('BACKLOG', 'IMPLEMENT')).toBe(false);
    expect(canTransition('DONE', 'TODO')).toBe(false);
  });

  it('exposes all transitions', () => {
    expect(STAGE_TRANSITIONS.DONE).toEqual([]);
  });
});
