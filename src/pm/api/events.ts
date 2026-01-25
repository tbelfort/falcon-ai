import type { WsEventPayload, WsEventType } from '../contracts/ws.js';

export function buildEventPayload<T>(
  event: WsEventType,
  projectId: string,
  payload: T,
  issueId?: string | null
): WsEventPayload<T> {
  return {
    type: event,
    at: Date.now(),
    projectId,
    issueId,
    payload,
  };
}
