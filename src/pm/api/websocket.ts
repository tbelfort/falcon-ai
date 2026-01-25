import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

export type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };

export type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: string; data: unknown }
  | { type: 'error'; message: string };

type Client = { ws: WebSocket; subscriptions: Set<string> };
const clients = new Map<string, Client>();

let broadcaster: ((channel: string, event: string, data: unknown) => void) | null =
  null;

export function setupWebSocket(server: import('http').Server): void {
  const { WebSocketServer: WSS } = require('ws');
  const wss = new WSS({ server, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (ws: WebSocket) => {
    const clientId = randomUUID();
    clients.set(clientId, { ws, subscriptions: new Set() });

    ws.send(JSON.stringify({ type: 'connected', clientId }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(clientId, msg, ws);
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });

    ws.on('error', (err) => {
      console.error('WS error:', err);
      clients.delete(clientId);
    });
  });

  broadcaster = broadcast;
}

function handleClientMessage(clientId: string, msg: unknown, ws: WebSocket) {
  const client = clients.get(clientId);
  if (!client) {
    return;
  }
  const message = msg as WsClientMessage;
  if (message.type === 'subscribe') {
    client.subscriptions.add(message.channel);
    ws.send(JSON.stringify({ type: 'subscribed', channel: message.channel }));
  }
  if (message.type === 'unsubscribe') {
    client.subscriptions.delete(message.channel);
    ws.send(JSON.stringify({ type: 'unsubscribed', channel: message.channel }));
  }
  if (message.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
  }
}

function broadcast(channel: string, event: string, data: unknown): void {
  const payload = JSON.stringify({ type: 'event', channel, event, data });
  for (const client of clients.values()) {
    if (client.subscriptions.has(channel) && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(payload);
    }
  }
}

export function getBroadcaster() {
  if (!broadcaster) {
    return () => {};
  }
  return broadcaster;
}