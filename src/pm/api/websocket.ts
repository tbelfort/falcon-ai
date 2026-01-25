import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { WsClientMessage, WsEventPayload } from '../contracts/ws.js';

type Client = { ws: WebSocket; subscriptions: Set<string> };

const clients = new Map<string, Client>();

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const clientId = randomUUID();
    clients.set(clientId, { ws, subscriptions: new Set() });

    ws.send(JSON.stringify({ type: 'connected', clientId }));

    ws.on('message', (data: RawData) => {
      let message: WsClientMessage;
      try {
        message = JSON.parse(data.toString()) as WsClientMessage;
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      if (message.type === 'subscribe') {
        clients.get(clientId)?.subscriptions.add(message.channel);
        ws.send(JSON.stringify({ type: 'subscribed', channel: message.channel }));
        return;
      }

      if (message.type === 'unsubscribe') {
        clients.get(clientId)?.subscriptions.delete(message.channel);
        ws.send(
          JSON.stringify({ type: 'unsubscribed', channel: message.channel })
        );
        return;
      }

      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });
  });
}

export function broadcast(
  channel: string,
  event: string,
  data: WsEventPayload
): void {
  const payload = JSON.stringify({ type: 'event', channel, event, data });
  for (const client of clients.values()) {
    if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}
