# WebSocket Real-Time Patterns

## Overview

This document covers WebSocket patterns for implementing real-time dashboard updates in falcon-pm, including agent status streaming, debug output, and live notifications.

## Technology Choices

### ws (Native WebSocket)
- Lightweight, fast, no dependencies beyond Node.js
- Full control over protocol
- Best for: Simple real-time updates, streaming output

### Socket.IO
- Auto-reconnection, fallback transports, rooms/namespaces
- Higher-level abstractions
- Best for: Complex real-time apps with multiple channels

For falcon-pm, `ws` is recommended for agent output streaming, with potential Socket.IO for dashboard features.

## Server Setup with Express

### Basic WebSocket Server

```typescript
// src/pm/api/websocket.ts
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { verifyToken } from './auth';

interface Client {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>;  // e.g., 'issue:123', 'agent:opus-1'
}

const clients = new Map<string, Client>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade with authentication
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    try {
      const user = verifyToken(token);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, user);
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request, user) => {
    const clientId = crypto.randomUUID();
    clients.set(clientId, {
      ws,
      userId: user.id,
      subscriptions: new Set(),
    });

    ws.on('message', (data) => {
      handleMessage(clientId, JSON.parse(data.toString()));
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for ${clientId}:`, err);
      clients.delete(clientId);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connected', clientId }));
  });

  return wss;
}
```

### Message Protocol

```typescript
// src/pm/api/websocket-types.ts

// Client -> Server messages
type ClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };

// Server -> Client messages
type ServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: string; data: unknown }
  | { type: 'error'; message: string };

// Channel patterns
// 'issue:123' - Issue updates
// 'agent:opus-1' - Agent status and output
// 'project:my-project' - Project-wide events
```

### Message Handler

```typescript
function handleMessage(clientId: string, message: ClientMessage) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case 'subscribe':
      client.subscriptions.add(message.channel);
      client.ws.send(JSON.stringify({
        type: 'subscribed',
        channel: message.channel
      }));
      break;

    case 'unsubscribe':
      client.subscriptions.delete(message.channel);
      client.ws.send(JSON.stringify({
        type: 'unsubscribed',
        channel: message.channel
      }));
      break;

    case 'ping':
      client.ws.send(JSON.stringify({ type: 'pong' }));
      break;
  }
}
```

## Broadcasting Patterns

### Broadcast to Channel

```typescript
export function broadcast(channel: string, event: string, data: unknown) {
  const message = JSON.stringify({
    type: 'event',
    channel,
    event,
    data,
  });

  for (const client of clients.values()) {
    if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

// Usage from other parts of the application
import { broadcast } from './websocket';

// When issue status changes
broadcast('issue:123', 'status_changed', {
  issueId: '123',
  oldStatus: 'in_progress',
  newStatus: 'done',
});

// When agent starts working
broadcast('agent:opus-1', 'agent_started', {
  agentId: 'opus-1',
  issueId: '123',
  stage: 'implement',
});
```

### Agent Output Streaming

```typescript
// Stream agent debug output to subscribed clients
export function streamAgentOutput(agentId: string, output: string) {
  broadcast(`agent:${agentId}`, 'output', {
    timestamp: Date.now(),
    content: output,
  });
}

// Throttled version for high-frequency output
const outputBuffers = new Map<string, string[]>();

export function streamAgentOutputThrottled(agentId: string, output: string) {
  const channel = `agent:${agentId}`;

  if (!outputBuffers.has(channel)) {
    outputBuffers.set(channel, []);

    // Flush every 100ms
    setInterval(() => {
      const buffer = outputBuffers.get(channel);
      if (buffer && buffer.length > 0) {
        broadcast(channel, 'output_batch', {
          timestamp: Date.now(),
          lines: buffer.splice(0),  // Clear and get all
        });
      }
    }, 100);
  }

  outputBuffers.get(channel)!.push(output);
}
```

## Client-Side Integration (React)

### WebSocket Hook

```typescript
// src/pm/dashboard/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from 'react';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectInterval?: number;
}

export function useWebSocket({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  reconnectInterval = 3000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      onConnect?.();
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage?.(data);
    };

    ws.onclose = () => {
      setIsConnected(false);
      onDisconnect?.();
      // Auto-reconnect
      reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [url, onMessage, onConnect, onDisconnect, reconnectInterval]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback((channel: string) => {
    send({ type: 'subscribe', channel });
  }, [send]);

  const unsubscribe = useCallback((channel: string) => {
    send({ type: 'unsubscribe', channel });
  }, [send]);

  return { isConnected, send, subscribe, unsubscribe };
}
```

### Agent Output Stream Component

```typescript
// src/pm/dashboard/components/AgentOutput.tsx
import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface AgentOutputProps {
  agentId: string;
}

export function AgentOutput({ agentId }: AgentOutputProps) {
  const [lines, setLines] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const { subscribe, unsubscribe, isConnected } = useWebSocket({
    url: `ws://localhost:3002/ws?token=${getToken()}`,
    onMessage: (data) => {
      if (data.type === 'event' && data.channel === `agent:${agentId}`) {
        if (data.event === 'output') {
          setLines(prev => [...prev, data.data.content].slice(-1000)); // Keep last 1000
        } else if (data.event === 'output_batch') {
          setLines(prev => [...prev, ...data.data.lines].slice(-1000));
        }
      }
    },
  });

  useEffect(() => {
    if (isConnected) {
      subscribe(`agent:${agentId}`);
      return () => unsubscribe(`agent:${agentId}`);
    }
  }, [agentId, isConnected, subscribe, unsubscribe]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className="agent-output bg-black text-green-400 font-mono text-sm p-4 h-96 overflow-auto"
    >
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
```

### Issue Updates Hook

```typescript
// src/pm/dashboard/hooks/useIssueUpdates.ts
import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { useIssueStore } from '../stores/issueStore';

export function useIssueUpdates(projectId: string) {
  const { updateIssue } = useIssueStore();

  const { subscribe, unsubscribe, isConnected } = useWebSocket({
    url: `ws://localhost:3002/ws?token=${getToken()}`,
    onMessage: (data) => {
      if (data.type === 'event') {
        switch (data.event) {
          case 'issue_created':
            // Refetch or add to store
            break;
          case 'issue_updated':
          case 'status_changed':
          case 'stage_changed':
            updateIssue(data.data.issueId, data.data);
            break;
          case 'agent_assigned':
            updateIssue(data.data.issueId, {
              assignedAgentId: data.data.agentId,
            });
            break;
        }
      }
    },
  });

  useEffect(() => {
    if (isConnected) {
      subscribe(`project:${projectId}`);
      return () => unsubscribe(`project:${projectId}`);
    }
  }, [projectId, isConnected, subscribe, unsubscribe]);
}
```

## Server-Sent Events (SSE) Alternative

For simpler one-way streaming (server to client only):

```typescript
// src/pm/api/routes/events.ts
import { Router } from 'express';

const router = Router();

router.get('/events/:agentId', (req, res) => {
  const { agentId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to agent events
  const listener = (output: string) => {
    sendEvent('output', { content: output, timestamp: Date.now() });
  };

  agentEmitter.on(`output:${agentId}`, listener);

  req.on('close', () => {
    agentEmitter.off(`output:${agentId}`, listener);
  });
});
```

## Scaling with Redis

For multi-server deployments:

```typescript
import { createClient } from 'redis';

const publisher = createClient();
const subscriber = createClient();

await publisher.connect();
await subscriber.connect();

// Publish from any server
export async function broadcastViaRedis(channel: string, event: string, data: unknown) {
  await publisher.publish('ws-broadcasts', JSON.stringify({ channel, event, data }));
}

// Each server subscribes and broadcasts to local clients
await subscriber.subscribe('ws-broadcasts', (message) => {
  const { channel, event, data } = JSON.parse(message);
  broadcast(channel, event, data);  // Local broadcast
});
```

## Security Considerations

1. **Authentication**: Validate tokens on upgrade before accepting connection
2. **Authorization**: Check permissions before allowing channel subscriptions
3. **Rate Limiting**: Limit message frequency per client
4. **Input Validation**: Validate all incoming messages
5. **Use WSS**: Always use secure WebSockets in production

```typescript
// Rate limiting example
const messageRates = new Map<string, number[]>();

function isRateLimited(clientId: string, maxPerSecond = 10): boolean {
  const now = Date.now();
  const timestamps = messageRates.get(clientId) || [];

  // Remove old timestamps
  const recent = timestamps.filter(t => now - t < 1000);
  recent.push(now);
  messageRates.set(clientId, recent);

  return recent.length > maxPerSecond;
}
```

## Sources

- [ws - WebSocket client and server for Node.js](https://github.com/websockets/ws)
- [Build Real-Time Dashboard with Node.js and Socket.io](https://codezup.com/building-a-real-time-dashboard-with-nodejs-and-socketio/)
- [Building Real-Time Dashboards with Node.js](https://blog.openreplay.com/real-time-dashboards-nodejs/)
- [WebSockets and Socket.IO in Node.js](https://dev.to/imsushant12/websockets-and-socketio-real-time-communication-with-nodejs-2j5f)
- [How to Use WebSockets in Node.js](https://www.sitepoint.com/real-time-apps-websockets-server-sent-events/)
