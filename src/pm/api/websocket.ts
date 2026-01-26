import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { WsClientMessage, WsServerMessage } from '../contracts/ws.js';

type Client = { ws: WebSocket; subscriptions: Set<string> };
const MAX_SUBSCRIPTIONS = 100;
const MAX_PAYLOAD_BYTES = 64 * 1024;

const ALLOWED_WS_ORIGINS = new Set([
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function isOriginAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  // Allow connections without Origin header (e.g., from non-browser clients)
  if (!origin) {
    return true;
  }
  return ALLOWED_WS_ORIGINS.has(origin);
}

export function createWebSocketHub() {
  const clients = new Map<string, Client>();
  let wss: WebSocketServer | null = null;

  function setupWebSocket(server: HttpServer) {
    wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_PAYLOAD_BYTES });

    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      // Validate Origin header to prevent cross-site WebSocket hijacking
      if (!isOriginAllowed(request)) {
        ws.close(1008, 'Origin not allowed');
        return;
      }

      const clientId = randomUUID();
      clients.set(clientId, { ws, subscriptions: new Set() });

      ws.send(JSON.stringify({ type: 'connected', clientId } satisfies WsServerMessage));

      ws.on('message', (data: RawData) => {
        let msg: WsClientMessage | null = null;
        try {
          msg = JSON.parse(data.toString()) as WsClientMessage;
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' } satisfies WsServerMessage));
          return;
        }

        const client = clients.get(clientId);
        if (!client) {
          return;
        }

        if (msg.type === 'subscribe') {
          if (
            !client.subscriptions.has(msg.channel)
            && client.subscriptions.size >= MAX_SUBSCRIPTIONS
          ) {
            ws.send(
              JSON.stringify(
                { type: 'error', message: 'Subscription limit exceeded' } satisfies WsServerMessage
              )
            );
            return;
          }
          client.subscriptions.add(msg.channel);
          ws.send(
            JSON.stringify(
              { type: 'subscribed', channel: msg.channel } satisfies WsServerMessage
            )
          );
        }

        if (msg.type === 'unsubscribe') {
          client.subscriptions.delete(msg.channel);
          ws.send(
            JSON.stringify(
              { type: 'unsubscribed', channel: msg.channel } satisfies WsServerMessage
            )
          );
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' } satisfies WsServerMessage));
        }
      });

      ws.on('close', () => {
        clients.delete(clientId);
      });

      ws.on('error', () => {
        clients.delete(clientId);
      });
    });
  }

  function broadcast(channel: string, event: string, data: unknown) {
    const payload = JSON.stringify({ type: 'event', channel, event, data });
    for (const client of clients.values()) {
      if (
        client.subscriptions.has(channel)
        && client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(payload);
      }
    }
  }

  function close() {
    wss?.close();
    clients.clear();
  }

  return { setupWebSocket, broadcast, close };
}

const defaultHub = createWebSocketHub();

export const setupWebSocket = defaultHub.setupWebSocket;
export const broadcast = defaultHub.broadcast;
export const closeWebSocket = defaultHub.close;
