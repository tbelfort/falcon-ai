import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { WebSocketServer, WebSocket } from 'ws';

import type {
  WsClientMessage,
  WsEventData,
  WsEventType,
  WsServerMessage,
} from '../contracts/ws.js';

type Client = { ws: WebSocket; subscriptions: Set<string> };

const clients = new Map<string, Client>();
const MAX_MESSAGE_BYTES = 4 * 1024;
const MAX_SUBSCRIPTIONS = 100;

function getMessageSize(data: WebSocket.RawData): number {
  if (typeof data === 'string') {
    return Buffer.byteLength(data);
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.length, 0);
  }
  return data.length;
}

function toMessageString(data: WebSocket.RawData): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString();
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString();
  }
  return data.toString();
}

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    clients.set(clientId, { ws, subscriptions: new Set() });

    const connected: WsServerMessage = { type: 'connected', clientId };
    ws.send(JSON.stringify(connected));

    ws.on('message', (data) => {
      const size = getMessageSize(data);
      if (size > MAX_MESSAGE_BYTES) {
        const errorMsg: WsServerMessage = {
          type: 'error',
          message: 'Message exceeds size limit.',
        };
        ws.send(JSON.stringify(errorMsg));
        return;
      }

      let parsed: WsClientMessage;
      try {
        parsed = JSON.parse(toMessageString(data)) as WsClientMessage;
      } catch (error) {
        const errorMsg: WsServerMessage = {
          type: 'error',
          message: 'Invalid message payload.',
        };
        ws.send(JSON.stringify(errorMsg));
        return;
      }

      const client = clients.get(clientId);
      if (!client) {
        return;
      }

      if (parsed.type === 'subscribe') {
        if (
          !client.subscriptions.has(parsed.channel) &&
          client.subscriptions.size >= MAX_SUBSCRIPTIONS
        ) {
          const errorMsg: WsServerMessage = {
            type: 'error',
            message: 'Subscription limit reached.',
          };
          ws.send(JSON.stringify(errorMsg));
          return;
        }
        client.subscriptions.add(parsed.channel);
        const ack: WsServerMessage = {
          type: 'subscribed',
          channel: parsed.channel,
        };
        ws.send(JSON.stringify(ack));
        return;
      }

      if (parsed.type === 'unsubscribe') {
        client.subscriptions.delete(parsed.channel);
        const ack: WsServerMessage = {
          type: 'unsubscribed',
          channel: parsed.channel,
        };
        ws.send(JSON.stringify(ack));
        return;
      }

      if (parsed.type === 'ping') {
        const pong: WsServerMessage = { type: 'pong' };
        ws.send(JSON.stringify(pong));
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });
  });
}

export function broadcast(
  channel: string,
  event: WsEventType,
  data: WsEventData
): void {
  const payload: WsServerMessage = {
    type: 'event',
    channel,
    event,
    data,
  };
  const message = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

export type BroadcastFn = typeof broadcast;
