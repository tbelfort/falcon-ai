import type { Services } from '../core/services/index.js';
import type { WsEvent, WsEventType } from '../contracts/ws.js';

export type BroadcastFn = (
  channel: string,
  event: WsEventType,
  data: WsEvent
) => void;

export interface ApiContext {
  services: Services;
  broadcast: BroadcastFn;
  now: () => number;
}
