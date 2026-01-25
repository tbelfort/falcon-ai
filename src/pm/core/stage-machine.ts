import type { IssueStage } from './types.js';

export const STAGE_TRANSITIONS: Record<IssueStage, readonly IssueStage[]> = {
  BACKLOG: ['TODO'],
  TODO: ['CONTEXT_PACK'],
  CONTEXT_PACK: ['CONTEXT_REVIEW'],
  CONTEXT_REVIEW: ['SPEC', 'IMPLEMENT'],
  SPEC: ['SPEC_REVIEW'],
  SPEC_REVIEW: ['IMPLEMENT', 'SPEC'],
  IMPLEMENT: ['PR_REVIEW'],
  PR_REVIEW: ['PR_HUMAN_REVIEW'],
  PR_HUMAN_REVIEW: ['FIXER', 'TESTING'],
  FIXER: ['PR_REVIEW'],
  TESTING: ['DOC_REVIEW', 'IMPLEMENT'],
  DOC_REVIEW: ['MERGE_READY'],
  MERGE_READY: ['DONE'],
  DONE: [],
};

export function canTransition(from: IssueStage, to: IssueStage): boolean {
  return STAGE_TRANSITIONS[from].includes(to);
}
