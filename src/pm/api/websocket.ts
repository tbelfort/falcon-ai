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

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    clients.set(clientId, { ws, subscriptions: new Set() });

    const connected: WsServerMessage = { type: 'connected', clientId };
    ws.send(JSON.stringify(connected));

    ws.on('message', (data) => {
      let parsed: WsClientMessage;
      try {
        parsed = JSON.parse(data.toString()) as WsClientMessage;
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
