import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { createApiApp } from '../../../src/pm/api/server.js';
import { setupWebSocket } from '../../../src/pm/api/websocket.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

async function waitForMessage(
  ws: WebSocket,
  predicate: (message: any) => boolean,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Timed out waiting for message'));
    }, timeoutMs);

    const handler = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString());
      if (predicate(parsed)) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(parsed);
      }
    };

    ws.on('message', handler);
  });
}

describe('PM API websocket events', () => {
  let server: http.Server | null = null;
  let ws: WebSocket | null = null;

  afterEach(async () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server = null;
    }
  });

  it('broadcasts issue created events', async () => {
    const app = createApiApp({ repos: createInMemoryRepos() });
    server = http.createServer(app);
    setupWebSocket(server);

    await new Promise<void>((resolve) => {
      server?.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const client = request(`http://localhost:${port}`);

    const projectResponse = await client
      .post('/api/projects')
      .send({
        name: 'Project',
        slug: 'project',
        description: null,
        repoUrl: null,
        defaultBranch: 'main',
      })
      .expect(200);
    const projectId = projectResponse.body.data.id as string;

    ws = new WebSocket(`ws://localhost:${port}/ws`);
    await once(ws, 'open');
    await waitForMessage(ws, (message) => message.type === 'connected');
    ws.send(
      JSON.stringify({ type: 'subscribe', channel: `project:${projectId}` })
    );
    await waitForMessage(ws, (message) => message.type === 'subscribed');

    const eventPromise = waitForMessage(
      ws,
      (message) => message.type === 'event' && message.event === 'issue.created'
    );

    const issueResponse = await client
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug' })
      .expect(200);
    const issueId = issueResponse.body.data.id as string;

    const eventMessage = await eventPromise;

    expect(eventMessage.channel).toBe(`project:${projectId}`);
    expect(eventMessage.data.type).toBe('issue.created');
    expect(eventMessage.data.projectId).toBe(projectId);
    expect(eventMessage.data.issueId).toBe(issueId);
    expect(eventMessage.data.payload.id).toBe(issueId);
    expect(typeof eventMessage.data.at).toBe('number');
  });
});
