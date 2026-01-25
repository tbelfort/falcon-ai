import http from 'node:http';
import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { createApiApp } from '../../../src/pm/api/server.js';
import { broadcast, setupWebSocket } from '../../../src/pm/api/websocket.js';
import type { WsServerMessage } from '../../../src/pm/contracts/ws.js';
import { createServices } from '../../../src/pm/core/services/index.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

describe('pm ws events', () => {
  it('broadcasts project update events', async () => {
    const repos = createInMemoryRepos();
    const services = createServices(repos, { now: () => 1_700_000_000 });
    const app = createApiApp({ services, broadcast });
    const server = http.createServer(app);
    setupWebSocket(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const ws = new WebSocket(wsUrl);
    const messages: WsServerMessage[] = [];
    const pending: Array<{
      predicate: (msg: WsServerMessage) => boolean;
      resolve: (msg: WsServerMessage) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }> = [];

    const handleMessage = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString()) as WsServerMessage;
      messages.push(parsed);
      for (const waiter of [...pending]) {
        if (waiter.predicate(parsed)) {
          clearTimeout(waiter.timeout);
          pending.splice(pending.indexOf(waiter), 1);
          waiter.resolve(parsed);
        }
      }
    };

    ws.on('message', handleMessage);

    const waitFor = (predicate: (msg: WsServerMessage) => boolean) => {
      const existing = messages.find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }
      return new Promise<WsServerMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.splice(
            pending.findIndex((item) => item.resolve === resolve),
            1
          );
          reject(new Error('Timed out waiting for WS message.'));
        }, 2000);

        pending.push({ predicate, resolve, reject, timeout });
      });
    };

    await waitFor((msg) => msg.type === 'connected');

    const projectResponse = await request(baseUrl).post('/api/projects').send({
      name: 'Broadcasts',
      slug: 'broadcasts',
      description: null,
      repoUrl: null,
      defaultBranch: 'main',
    });
    const projectId = projectResponse.body.data.id;

    ws.send(JSON.stringify({ type: 'subscribe', channel: `project:${projectId}` }));
    await waitFor((msg) => msg.type === 'subscribed');

    await request(baseUrl)
      .patch(`/api/projects/${projectId}`)
      .send({ name: 'Broadcasted' });

    const eventMessage = await waitFor(
      (msg) => msg.type === 'event' && msg.event === 'project.updated'
    );
    if (eventMessage.type !== 'event') {
      throw new Error('Expected event message.');
    }

    expect(eventMessage.channel).toBe(`project:${projectId}`);
    expect(eventMessage.data.type).toBe('project.updated');
    expect(eventMessage.data.projectId).toBe(projectId);

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', () => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('broadcasts issue creation events', async () => {
    const repos = createInMemoryRepos();
    const services = createServices(repos, { now: () => 1_700_000_000 });
    const app = createApiApp({ services, broadcast });
    const server = http.createServer(app);
    setupWebSocket(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const projectResponse = await request(baseUrl).post('/api/projects').send({
      name: 'Realtime',
      slug: 'realtime',
      description: null,
      repoUrl: null,
      defaultBranch: 'main',
    });
    const projectId = projectResponse.body.data.id;

    const ws = new WebSocket(wsUrl);
    const messages: WsServerMessage[] = [];
    const pending: Array<{
      predicate: (msg: WsServerMessage) => boolean;
      resolve: (msg: WsServerMessage) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }> = [];

    const handleMessage = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString()) as WsServerMessage;
      messages.push(parsed);
      for (const waiter of [...pending]) {
        if (waiter.predicate(parsed)) {
          clearTimeout(waiter.timeout);
          pending.splice(pending.indexOf(waiter), 1);
          waiter.resolve(parsed);
        }
      }
    };

    ws.on('message', handleMessage);

    const waitFor = (predicate: (msg: WsServerMessage) => boolean) => {
      const existing = messages.find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }
      return new Promise<WsServerMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.splice(
            pending.findIndex((item) => item.resolve === resolve),
            1
          );
          reject(new Error('Timed out waiting for WS message.'));
        }, 2000);

        pending.push({ predicate, resolve, reject, timeout });
      });
    };

    await waitFor((msg) => msg.type === 'connected');
    ws.send(JSON.stringify({ type: 'subscribe', channel: `project:${projectId}` }));
    await waitFor((msg) => msg.type === 'subscribed');

    await request(baseUrl).post('/api/issues').send({
      projectId,
      title: 'Realtime issue',
      description: null,
      priority: 'low',
    });

    const eventMessage = await waitFor(
      (msg) => msg.type === 'event' && msg.event === 'issue.created'
    );
    if (eventMessage.type !== 'event') {
      throw new Error('Expected event message.');
    }

    expect(eventMessage.channel).toBe(`project:${projectId}`);
    expect(eventMessage.data.type).toBe('issue.created');
    expect(eventMessage.data.projectId).toBe(projectId);

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', () => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
