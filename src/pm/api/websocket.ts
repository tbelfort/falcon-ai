import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { WsClientMessage, WsEvent, WsEventType } from '../contracts/ws.js';

type Client = { ws: WebSocket; subscriptions: Set<string> };

const clients = new Map<string, Client>();

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    clients.set(clientId, { ws, subscriptions: new Set() });

    ws.send(JSON.stringify({ type: 'connected', clientId }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsClientMessage;

        if (msg.type === 'subscribe') {
          clients.get(clientId)?.subscriptions.add(msg.channel);
          ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }));
          return;
        }

        if (msg.type === 'unsubscribe') {
          clients.get(clientId)?.subscriptions.delete(msg.channel);
          ws.send(
            JSON.stringify({ type: 'unsubscribed', channel: msg.channel })
          );
          return;
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Invalid message',
          })
        );
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });
  });
}

export function broadcast(channel: string, event: WsEventType, data: WsEvent): void {
  const payload = JSON.stringify({ type: 'event', channel, event, data });
  for (const client of clients.values()) {
    if (
      client.subscriptions.has(channel) &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(payload);
    }
  }
}
