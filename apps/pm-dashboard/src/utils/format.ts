import type { IssueStage } from '../api/types';

export function formatStage(stage: IssueStage) {
  return stage
    .split('_')
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(' ');
}

export function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
