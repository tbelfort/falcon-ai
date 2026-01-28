import { useEffect, useRef } from 'react';
import type { WsClientMessage, WsServerMessage } from '@/api/types';

export type WebSocketConnection = {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send: (data: string) => void;
  close: () => void;
};

export type WebSocketTransport = {
  connect: (url: string) => WebSocketConnection;
};

export class FakeWebSocketTransport implements WebSocketTransport {
  sentMessages: string[] = [];
  private connections = new Set<WebSocketConnection>();

  connect(_url: string): WebSocketConnection {
    const connection: WebSocketConnection = {
      readyState: 1,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: (data: string) => {
        this.sentMessages.push(data);
      },
      close: () => {
        connection.readyState = 3;
        if (connection.onclose) {
          connection.onclose(new CloseEvent('close'));
        }
        this.connections.delete(connection);
      },
    };

    this.connections.add(connection);
    queueMicrotask(() => {
      if (connection.onopen) {
        connection.onopen(new Event('open'));
      }
    });

    return connection;
  }

  publish(message: WsServerMessage) {
    const payload = JSON.stringify(message);
    this.connections.forEach((connection) => {
      if (connection.onmessage) {
        connection.onmessage(new MessageEvent('message', { data: payload }));
      }
    });
  }
}

type WebSocketOptions = {
  url: string | null;
  onEvent: (message: WsServerMessage) => void;
  subscriptions?: string[];
  /** Set to true to enable WebSocket in test environment. Default: disabled in VITEST. */
  enableInTest?: boolean;
  transport?: WebSocketTransport;
};

export const INITIAL_RECONNECT_DELAY_MS = 1000;
export const MAX_RECONNECT_DELAY_MS = 30000;
export const PING_INTERVAL_MS = 30000;

export function useWebSocket({
  url,
  onEvent,
  subscriptions = [],
  enableInTest = false,
  transport,
}: WebSocketOptions) {
  const latestHandler = useRef(onEvent);
  latestHandler.current = onEvent;

  useEffect(() => {
    // Skip WebSocket in test environment unless explicitly enabled or a transport is injected
    if (import.meta.env.VITEST && !enableInTest && !transport) {
      return;
    }
    if (!url) {
      return;
    }

    if (!transport && typeof WebSocket === 'undefined') {
      return;
    }

    let ws: WebSocketConnection | null = null;
    let pingInterval: number | null = null;
    let reconnectTimeout: number | null = null;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let isCleaningUp = false;
    const openState = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1;

    const connect = () => {
      if (isCleaningUp) return;

      ws = transport ? transport.connect(url) : new WebSocket(url);
      const send = (message: WsClientMessage) => {
        if (ws?.readyState === openState) {
          ws.send(JSON.stringify(message));
        }
      };

      ws.onopen = () => {
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        subscriptions.forEach((channel) => send({ type: 'subscribe', channel }));

        pingInterval = window.setInterval(() => {
          send({ type: 'ping' });
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsServerMessage;
          latestHandler.current(message);
        } catch (error) {
          console.error('WS parse error', error);
        }
      };

      ws.onerror = (event) => {
        console.error('WS error', event);
      };

      ws.onclose = () => {
        if (pingInterval !== null) {
          window.clearInterval(pingInterval);
          pingInterval = null;
        }

        if (!isCleaningUp) {
          reconnectTimeout = window.setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
            connect();
          }, reconnectDelay);
        }
      };
    };

    connect();

    return () => {
      isCleaningUp = true;

      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if (pingInterval !== null) {
        window.clearInterval(pingInterval);
        pingInterval = null;
      }

        if (ws) {
          try {
            if (ws.readyState === openState) {
              subscriptions.forEach((channel) => {
                ws!.send(JSON.stringify({ type: 'unsubscribe', channel }));
              });
            }
            ws.close();
          } catch {
            // Ignore errors during cleanup
          }
          ws = null;
        }
      };
  }, [url, subscriptions.join('|'), transport]);
}
