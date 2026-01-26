import { renderHook, act } from '@testing-library/react';
import {
  useWebSocket,
  INITIAL_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  PING_INTERVAL_MS,
} from '@/hooks/useWebSocket';
import type { WsServerMessage } from '@/api/types';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Simulate async connection
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  simulateMessage(data: WsServerMessage) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects to the provided URL', async () => {
    const onEvent = vi.fn();

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        enableInTest: true,
      }),
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:3002/ws');
  });

  it('does not connect when url is null', () => {
    const onEvent = vi.fn();

    renderHook(() =>
      useWebSocket({
        url: null,
        onEvent,
        enableInTest: true,
      }),
    );

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('subscribes to channels on connection open', async () => {
    const onEvent = vi.fn();

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        subscriptions: ['project:123', 'issue:456'],
        enableInTest: true,
      }),
    );

    // Wait for onopen to fire
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.sentMessages).toContainEqual(JSON.stringify({ type: 'subscribe', channel: 'project:123' }));
    expect(ws.sentMessages).toContainEqual(JSON.stringify({ type: 'subscribe', channel: 'issue:456' }));
  });

  it('handles incoming messages and calls onEvent', async () => {
    const onEvent = vi.fn();

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        enableInTest: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const ws = MockWebSocket.instances[0];
    const message: WsServerMessage = {
      type: 'event',
      channel: 'issue:123',
      event: 'stage_changed',
      data: { issueId: '123', stage: 'DONE' },
    };

    act(() => {
      ws.simulateMessage(message);
    });

    expect(onEvent).toHaveBeenCalledWith(message);
  });

  it('sends ping messages at the configured interval', async () => {
    const onEvent = vi.fn();

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        enableInTest: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const ws = MockWebSocket.instances[0];
    ws.sentMessages = []; // Clear subscription messages

    // Advance time to trigger ping
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    });

    expect(ws.sentMessages).toContainEqual(JSON.stringify({ type: 'ping' }));
  });

  it('reconnects with exponential backoff on connection close', async () => {
    const onEvent = vi.fn();

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        enableInTest: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    const firstWs = MockWebSocket.instances[0];

    // Simulate connection close
    act(() => {
      firstWs.simulateClose();
    });

    // Advance time past initial reconnect delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INITIAL_RECONNECT_DELAY_MS);
    });

    // Should have created a new connection
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('caps reconnect delay at MAX_RECONNECT_DELAY_MS', async () => {
    const onEvent = vi.fn();

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        enableInTest: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Simulate multiple disconnections to increase backoff
    let currentDelay = INITIAL_RECONNECT_DELAY_MS;
    for (let i = 0; i < 10; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      act(() => {
        ws.simulateClose();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(Math.min(currentDelay, MAX_RECONNECT_DELAY_MS));
      });

      currentDelay = Math.min(currentDelay * 2, MAX_RECONNECT_DELAY_MS);
    }

    // Should have reconnected multiple times but delay should be capped
    expect(MockWebSocket.instances.length).toBeGreaterThan(5);
  });

  it('resets reconnect delay after successful connection', async () => {
    const onEvent = vi.fn();

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        enableInTest: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Close and reconnect a few times to increase backoff
    for (let i = 0; i < 3; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      act(() => {
        ws.simulateClose();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS);
      });
    }

    const countBefore = MockWebSocket.instances.length;

    // Now close again - delay should be reset since last connection was successful
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.simulateClose();
    });

    // Advance by initial delay - should reconnect
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INITIAL_RECONNECT_DELAY_MS);
    });

    expect(MockWebSocket.instances.length).toBe(countBefore + 1);
  });

  it('unsubscribes from channels on cleanup', async () => {
    const onEvent = vi.fn();

    const { unmount } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        subscriptions: ['project:123'],
        enableInTest: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const ws = MockWebSocket.instances[0];
    ws.sentMessages = []; // Clear subscription messages

    unmount();

    expect(ws.sentMessages).toContainEqual(JSON.stringify({ type: 'unsubscribe', channel: 'project:123' }));
  });

  it('cancels pending reconnect on cleanup', async () => {
    const onEvent = vi.fn();

    const { unmount } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        enableInTest: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const ws = MockWebSocket.instances[0];

    // Close to trigger reconnect timer
    act(() => {
      ws.simulateClose();
    });

    // Unmount before reconnect
    unmount();

    const countAfterUnmount = MockWebSocket.instances.length;

    // Advance time past reconnect delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INITIAL_RECONNECT_DELAY_MS + 100);
    });

    // Should NOT have created a new connection
    expect(MockWebSocket.instances.length).toBe(countAfterUnmount);
  });

  it('handles JSON parse errors gracefully', async () => {
    const onEvent = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3002/ws',
        onEvent,
        enableInTest: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const ws = MockWebSocket.instances[0];

    // Send invalid JSON
    act(() => {
      if (ws.onmessage) {
        ws.onmessage(new MessageEvent('message', { data: 'invalid json' }));
      }
    });

    expect(consoleError).toHaveBeenCalledWith('WS parse error', expect.any(Error));
    expect(onEvent).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
