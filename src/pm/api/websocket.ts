import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { WsClientMessage, WsEvent, WsEventType } from '../contracts/ws.js';
import {
  extractAuthTokenFromHeaders,
  isOriginAllowed,
  resolveAllowedOrigins,
  resolveAuthToken,
} from './security.js';

type Client = { ws: WebSocket; subscriptions: Set<string>; ip: string };
type VerifyClientInfo = { origin?: string; req: IncomingMessage };
type VerifyClientCallback = (result: boolean, code?: number, message?: string) => void;

const clients = new Map<string, Client>();
const connectionsByIp = new Map<string, number>();

const DEFAULT_MAX_SUBSCRIPTIONS = 100;
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;
const DEFAULT_MAX_CONNECTIONS_PER_IP = 20;

export interface WebSocketOptions {
  authToken?: string;
  allowedOrigins?: string[];
  maxPayloadBytes?: number;
  maxConnectionsPerIp?: number;
  maxSubscriptions?: number;
}

export function setupWebSocket(
  server: Server,
  options: WebSocketOptions = {}
): void {
  const authToken = resolveAuthToken(options.authToken);
  const allowedOrigins = resolveAllowedOrigins(options.allowedOrigins);
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const maxConnectionsPerIp =
    options.maxConnectionsPerIp ?? DEFAULT_MAX_CONNECTIONS_PER_IP;
  const maxSubscriptions =
    options.maxSubscriptions ?? DEFAULT_MAX_SUBSCRIPTIONS;

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: maxPayloadBytes,
    verifyClient: (info: VerifyClientInfo, done: VerifyClientCallback) => {
      if (!isOriginAllowed(info.origin ?? undefined, allowedOrigins)) {
        done(false, 403, 'Forbidden');
        return;
      }
      const token = extractWsToken(info.req);
      if (!token || token !== authToken) {
        done(false, 401, 'Unauthorized');
        return;
      }
      const ip = getClientIp(info.req);
      const current = connectionsByIp.get(ip) ?? 0;
      if (current >= maxConnectionsPerIp) {
        done(false, 429, 'Too Many Connections');
        return;
      }
      done(true);
    },
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = randomUUID();
    const ip = getClientIp(req);
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);
    clients.set(clientId, { ws, subscriptions: new Set(), ip });

    safeSend(ws, JSON.stringify({ type: 'connected', clientId }));

    ws.on('message', (data: unknown) => {
      try {
        const msg = JSON.parse(toMessageText(data)) as WsClientMessage;
        const client = clients.get(clientId);
        if (!client) {
          return;
        }

        if (msg.type === 'subscribe') {
          if (typeof msg.channel !== 'string') {
            safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid channel' }));
            return;
          }
          if (!client.subscriptions.has(msg.channel)) {
            if (client.subscriptions.size >= maxSubscriptions) {
              safeSend(
                ws,
                JSON.stringify({
                  type: 'error',
                  message: 'Subscription limit reached',
                })
              );
              return;
            }
            client.subscriptions.add(msg.channel);
          }
          safeSend(
            ws,
            JSON.stringify({ type: 'subscribed', channel: msg.channel })
          );
          return;
        }

        if (msg.type === 'unsubscribe') {
          if (typeof msg.channel !== 'string') {
            safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid channel' }));
            return;
          }
          client.subscriptions.delete(msg.channel);
          safeSend(
            ws,
            JSON.stringify({ type: 'unsubscribed', channel: msg.channel })
          );
          return;
        }

        if (msg.type === 'ping') {
          safeSend(ws, JSON.stringify({ type: 'pong' }));
          return;
        }

        safeSend(ws, JSON.stringify({ type: 'error', message: 'Unknown message' }));
      } catch (error) {
        safeSend(
          ws,
          JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Invalid message',
          })
        );
      }
    });

    ws.on('close', () => {
      const stored = clients.get(clientId);
      clients.delete(clientId);
      if (stored) {
        decrementConnections(stored.ip);
      }
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
      safeSend(client.ws, payload);
    }
  }
}

function safeSend(ws: WebSocket, payload: string): void {
  try {
    ws.send(payload);
  } catch (error) {
    void error;
  }
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (candidate) {
    return candidate.split(',')[0]?.trim() || 'unknown';
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function extractWsToken(req: IncomingMessage): string | null {
  const headerToken = extractAuthTokenFromHeaders(req.headers);
  if (headerToken) {
    return headerToken;
  }
  const url = new URL(req.url ?? '', 'http://localhost');
  return url.searchParams.get('token');
}

function decrementConnections(ip: string): void {
  const current = connectionsByIp.get(ip);
  if (!current) {
    return;
  }
  if (current <= 1) {
    connectionsByIp.delete(ip);
    return;
  }
  connectionsByIp.set(ip, current - 1);
}

function toMessageText(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString();
  }
  if (Array.isArray(data) && data.every((item) => Buffer.isBuffer(item))) {
    return Buffer.concat(data).toString();
  }
  if (Buffer.isBuffer(data)) {
    return data.toString();
  }
  return String(data);
}
