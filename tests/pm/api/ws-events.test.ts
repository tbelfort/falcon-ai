import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createWebSocketHub } from '../../../src/pm/api/websocket.js';
import type { WsServerMessage } from '../../../src/pm/contracts/ws.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

function createMessageQueue(ws: WebSocket) {
  const messages: WsServerMessage[] = [];
  const listeners = new Set<(message: WsServerMessage) => void>();

  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString()) as WsServerMessage;
    messages.push(parsed);
    for (const listener of listeners) {
      listener(parsed);
    }
  });

  const waitForMessage = (
    predicate: (message: WsServerMessage) => boolean,
    timeoutMs: number = 2000
  ) => {
    const existing = messages.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise<WsServerMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for WS message'));
      }, timeoutMs);

      const listener = (message: WsServerMessage) => {
        if (predicate(message)) {
          cleanup();
          resolve(message);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        listeners.delete(listener);
      };

      listeners.add(listener);
    });
  };

  return { waitForMessage };
}

describe('pm api ws origin validation', () => {
  it('rejects WebSocket connections from disallowed origins', async () => {
    const repos = createInMemoryRepos();
    const hub = createWebSocketHub();
    const app = createApiServer({ repos, broadcaster: hub.broadcast });
    const server = createServer(app);
    hub.setupWebSocket(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    // Attempt connection with disallowed origin
    const ws = new WebSocket(`ws://localhost:${port}/ws`, {
      headers: { origin: 'https://evil.example.com' },
    });

    // The connection may briefly open before the server closes it,
    // so we wait for the close event regardless of whether open fires first
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for connection to be closed'));
      }, 5000);

      ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        try {
          expect(code).toBe(1008);
          expect(reason.toString()).toBe('Origin not allowed');
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      ws.on('error', () => {
        clearTimeout(timeout);
        // Expected - connection rejected
        resolve();
      });
    });

    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('accepts WebSocket connections without origin header', async () => {
    const repos = createInMemoryRepos();
    const hub = createWebSocketHub();
    const app = createApiServer({ repos, broadcaster: hub.broadcast });
    const server = createServer(app);
    hub.setupWebSocket(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    // Connection without origin header (non-browser client)
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const queue = createMessageQueue(ws);

    // Should receive connected message
    await queue.waitForMessage((message) => message.type === 'connected');

    ws.close();
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe('pm api ws events', () => {
  it('broadcasts issue.created events', async () => {
    const repos = createInMemoryRepos();
    const hub = createWebSocketHub();
    const app = createApiServer({ repos, broadcaster: hub.broadcast });
    const server = createServer(app);
    hub.setupWebSocket(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const queue = createMessageQueue(ws);
    await queue.waitForMessage((message) => message.type === 'connected');
    ws.send(JSON.stringify({ type: 'subscribe', channel: `project:${projectId}` }));
    await queue.waitForMessage(
      (message) => message.type === 'subscribed' && message.channel === `project:${projectId}`
    );

    await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });

    const eventMessage = await queue.waitForMessage(
      (message) =>
        message.type === 'event' && message.event === 'issue.created'
    );

    if (eventMessage.type !== 'event' || eventMessage.event === 'agent.output') {
      throw new Error('Expected event message');
    }

    const payload = eventMessage.data.payload as { projectId: string };
    expect(payload.projectId).toBe(projectId);
    expect(eventMessage.data.type).toBe('issue.created');

    ws.close();
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('broadcasts label, comment, document, and issue updates', async () => {
    const repos = createInMemoryRepos();
    const hub = createWebSocketHub();
    const app = createApiServer({ repos, broadcaster: hub.broadcast });
    const server = createServer(app);
    hub.setupWebSocket(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const queue = createMessageQueue(ws);
    await queue.waitForMessage((message) => message.type === 'connected');
    ws.send(JSON.stringify({ type: 'subscribe', channel: `project:${projectId}` }));
    await queue.waitForMessage(
      (message) => message.type === 'subscribed' && message.channel === `project:${projectId}`
    );

    await request(app)
      .post(`/api/projects/${projectId}/labels`)
      .send({ name: 'bug', color: '#ef4444' });

    const labelMessage = await queue.waitForMessage(
      (message) => message.type === 'event' && message.event === 'label.created'
    );
    if (labelMessage.type !== 'event' || labelMessage.event === 'agent.output') {
      throw new Error('Expected event message');
    }
    expect(labelMessage.data.type).toBe('label.created');

    const issueRes = await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });
    const issueId = issueRes.body.data.id as string;

    await queue.waitForMessage(
      (message) => message.type === 'event' && message.event === 'issue.created'
    );

    await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .send({ content: 'Looks good', authorType: 'human', authorName: 'Alex' });

    const commentMessage = await queue.waitForMessage(
      (message) => message.type === 'event' && message.event === 'comment.created'
    );
    if (commentMessage.type !== 'event' || commentMessage.event === 'agent.output') {
      throw new Error('Expected event message');
    }
    const commentEvent = commentMessage.data as { issueId: string; type: string };
    expect(commentEvent.issueId).toBe(issueId);

    await request(app)
      .post(`/api/issues/${issueId}/documents`)
      .send({
        title: 'Context Pack',
        docType: 'context_pack',
        filePath: '.falcon/issues/1/context/context-pack.md',
      });

    const documentMessage = await queue.waitForMessage(
      (message) => message.type === 'event' && message.event === 'document.created'
    );
    if (documentMessage.type !== 'event' || documentMessage.event === 'agent.output') {
      throw new Error('Expected event message');
    }
    const documentEvent = documentMessage.data as { issueId: string; type: string };
    expect(documentEvent.issueId).toBe(issueId);

    await request(app)
      .patch(`/api/issues/${issueId}`)
      .send({ title: 'Fix bug soon' });

    await queue.waitForMessage(
      (message) => message.type === 'event' && message.event === 'issue.updated'
    );

    ws.close();
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
