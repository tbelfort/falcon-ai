import type { WsDomainEventType, WsEvent } from '../contracts/ws.js';

export type WsBroadcaster = (
  channel: string,
  event: WsDomainEventType,
  data: WsEvent
) => void;

export function broadcastEvents(broadcaster: WsBroadcaster, events: WsEvent[]) {
  for (const event of events) {
    const hasIssue = 'issueId' in event;
    const channels = hasIssue
      ? [`project:${event.projectId}`, `issue:${event.issueId}`]
      : [`project:${event.projectId}`];

    for (const channel of channels) {
      broadcaster(channel, event.type, event);
    }
  }
}
