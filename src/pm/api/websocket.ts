import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { WsClientMessage, WsServerMessage } from '../contracts/ws.js';

interface Client {
  ws: WebSocket;
  subscriptions: Set<string>;
}

const clients = new Map<string, Client>();

let wss: WebSocketServer | null = null;

export function setupWebSocket(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    clients.set(clientId, { ws, subscriptions: new Set() });

    const send = (msg: WsServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    send({ type: 'connected', clientId });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsClientMessage;

        if (msg.type === 'subscribe') {
          const client = clients.get(clientId);
          if (client) {
            client.subscriptions.add(msg.channel);
            send({ type: 'subscribed', channel: msg.channel });
          }
        } else if (msg.type === 'unsubscribe') {
          const client = clients.get(clientId);
          if (client) {
            client.subscriptions.delete(msg.channel);
            send({ type: 'unsubscribed', channel: msg.channel });
          }
        } else if (msg.type === 'ping') {
          send({ type: 'pong' });
        }
      } catch {
        send({ type: 'error', message: 'Invalid message format' });
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });

    ws.on('error', () => {
      clients.delete(clientId);
    });
  });

  return wss;
}

export function broadcast(channel: string, event: string, data: unknown): void {
  const payload = JSON.stringify({ type: 'event', channel, event, data });

  for (const client of clients.values()) {
    if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

export function getConnectedClientCount(): number {
  return clients.size;
}

export function closeWebSocket(): void {
  if (wss) {
    for (const client of clients.values()) {
      client.ws.close();
    }
    clients.clear();
    wss.close();
    wss = null;
  }
}

// Helper to broadcast to project and issue channels
export function broadcastProjectEvent(projectId: string, event: string, data: unknown): void {
  broadcast(`project:${projectId}`, event, data);
}

export function broadcastIssueEvent(
  projectId: string,
  issueId: string,
  event: string,
  data: unknown
): void {
  // Broadcast to both project and issue channels
  broadcast(`project:${projectId}`, event, data);
  broadcast(`issue:${issueId}`, event, data);
}
