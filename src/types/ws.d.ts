// Type declarations for ws module
declare module 'ws' {
  import type { Server as HttpServer, IncomingMessage } from 'node:http';
  import type EventEmitter from 'node:events';

  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export class WebSocket extends EventEmitter {
    static CONNECTING: 0;
    static OPEN: 1;
    static CLOSING: 2;
    static CLOSED: 3;

    CONNECTING: 0;
    OPEN: 1;
    CLOSING: 2;
    CLOSED: 3;

    readyState: 0 | 1 | 2 | 3;

    constructor(url: string | URL, options?: object);

    close(code?: number, reason?: string | Buffer): void;
    send(data: string | Buffer | ArrayBuffer | Buffer[], cb?: (err?: Error) => void): void;
    ping(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;
    terminate(): void;

    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: RawData, isBinary: boolean) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  }

  export interface ServerOptions {
    server?: HttpServer;
    host?: string;
    port?: number;
    path?: string;
    maxPayload?: number;
    clientTracking?: boolean;
    perMessageDeflate?: boolean | object;
    handleProtocols?: (protocols: Set<string>, request: IncomingMessage) => string | false;
    noServer?: boolean;
    verifyClient?: (
      info: { origin: string; secure: boolean; req: IncomingMessage },
      callback: (result: boolean, code?: number, message?: string, headers?: Record<string, string>) => void
    ) => void | boolean;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: ServerOptions, callback?: () => void);

    close(cb?: (err?: Error) => void): void;

    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'headers', listener: (headers: string[], request: IncomingMessage) => void): this;
    on(event: 'close' | 'listening', listener: () => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  }
}
