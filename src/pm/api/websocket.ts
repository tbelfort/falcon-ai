import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { defaultOutputBus, type OutputBus } from '../agents/output/output-bus.js';
import type { WsClientMessage, WsServerMessage } from '../contracts/ws.js';

type Client = { ws: WebSocket; subscriptions: Set<string> };
const MAX_SUBSCRIPTIONS = 100;
const MAX_PAYLOAD_BYTES = 64 * 1024;

const DEFAULT_LOCALHOST_ORIGINS = [
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function resolveAllowedOrigins(): Set<string> {
  const raw = process.env.FALCON_PM_CORS_ORIGINS;
  if (!raw) {
    return new Set(DEFAULT_LOCALHOST_ORIGINS);
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return new Set(origins.length > 0 ? origins : DEFAULT_LOCALHOST_ORIGINS);
}

function isOriginAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  // Allow connections without Origin header (e.g., from non-browser clients)
  if (!origin) {
    return true;
  }
  const allowedOrigins = resolveAllowedOrigins();
  return allowedOrigins.has(origin);
}

export interface WebSocketHubOptions {
  outputBus?: OutputBus;
}

export function createWebSocketHub(options: WebSocketHubOptions = {}) {
  const clients = new Map<string, Client>();
  let wss: WebSocketServer | null = null;
  const outputBus = options.outputBus;
  const outputSubscriptions = new Map<string, { count: number; unsubscribe: () => void }>();

  function parseRunChannel(channel: string): string | null {
    if (!channel.startsWith('run:')) {
      return null;
    }
    const runId = channel.slice('run:'.length).trim();
    return runId.length > 0 ? runId : null;
  }

  function ensureOutputSubscription(runId: string) {
    if (!outputBus) {
      return;
    }

    const existing = outputSubscriptions.get(runId);
    if (existing) {
      existing.count += 1;
      return;
    }

    const unsubscribe = outputBus.subscribe(runId, (line) => {
      broadcast(`run:${runId}`, 'agent.output', line);
    });
    outputSubscriptions.set(runId, { count: 1, unsubscribe });
  }

  function releaseOutputSubscription(runId: string) {
    const existing = outputSubscriptions.get(runId);
    if (!existing) {
      return;
    }

    existing.count -= 1;
    if (existing.count <= 0) {
      existing.unsubscribe();
      outputSubscriptions.delete(runId);
    }
  }

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
          const runId = parseRunChannel(msg.channel);
          if (runId) {
            ensureOutputSubscription(runId);
          }
          ws.send(
            JSON.stringify(
              { type: 'subscribed', channel: msg.channel } satisfies WsServerMessage
            )
          );
        }

        if (msg.type === 'unsubscribe') {
          if (client.subscriptions.delete(msg.channel)) {
            const runId = parseRunChannel(msg.channel);
            if (runId) {
              releaseOutputSubscription(runId);
            }
          }
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

      const cleanupClient = () => {
        const client = clients.get(clientId);
        if (client) {
          for (const channel of client.subscriptions) {
            const runId = parseRunChannel(channel);
            if (runId) {
              releaseOutputSubscription(runId);
            }
          }
        }
        clients.delete(clientId);
      };

      ws.on('close', cleanupClient);
      ws.on('error', cleanupClient);
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
    for (const subscription of outputSubscriptions.values()) {
      subscription.unsubscribe();
    }
    outputSubscriptions.clear();
  }

  return { setupWebSocket, broadcast, close };
}

const defaultHub = createWebSocketHub({ outputBus: defaultOutputBus });

export const setupWebSocket = defaultHub.setupWebSocket;
export const broadcast = defaultHub.broadcast;
export const closeWebSocket = defaultHub.close;
