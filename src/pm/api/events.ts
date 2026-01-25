import type { WsEventPayload, WsEventType } from '../contracts/ws.js';

export function buildEventPayload<T>(
  event: WsEventType,
  projectId: string,
  payload: T,
  issueId?: string | null
): WsEventPayload<T> {
  return {
    type: event,
    at: Math.floor(Date.now() / 1000),
    projectId,
    issueId,
    payload,
  };
}
