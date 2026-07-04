import WebSocket from "ws";

import type { ServerConfig } from "../config.js";
import type { Json0Op } from "../ot/apply.js";

const COLLECTION = "tripPlans";
const DEFAULT_BASE_URL = "https://wanderlog.com";
const DEFAULT_WS_BASE_URL = "wss://wanderlog.com";

export interface ShareDbSocketLike {
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (data: unknown) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  send(data: string): void;
  close(): void;
}

export type ShareDbSocketFactory = (input: {
  url: string;
  headers: Record<string, string>;
}) => ShareDbSocketLike;

export interface ShareDbClientOptions {
  socketFactory?: ShareDbSocketFactory;
  baseUrl?: string;
  wsBaseUrl?: string;
}

type PendingSubscription = {
  resolve: (subscription: { version: number; snapshot: unknown }) => void;
  reject: (error: Error) => void;
};

type PendingSubmit = {
  resolve: () => void;
  reject: (error: Error) => void;
};

type RemoteOpListener = (ops: Json0Op[]) => void;

type ShareDbFrame = {
  a?: string;
  id?: string | null;
  c?: string;
  d?: string;
  data?: { v?: number; data?: unknown };
  v?: number;
  seq?: number;
  op?: unknown;
  error?: unknown;
};

export class ShareDbClient {
  private readonly socketFactory: ShareDbSocketFactory;
  private readonly baseUrl: string;
  private readonly wsBaseUrl: string;
  private socket: ShareDbSocketLike | null = null;
  private subscribePromise: Promise<{
    version: number;
    snapshot: unknown;
  }> | null = null;
  private pendingSubscription: PendingSubscription | null = null;
  private pendingSubmits = new Map<number, PendingSubmit>();
  private readonly remoteOpListeners = new Set<RemoteOpListener>();
  private seq = 0;
  private version: number | null = null;

  constructor(
    private readonly config: ServerConfig,
    private readonly tripId: string,
    options: ShareDbClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.wsBaseUrl = options.wsBaseUrl ?? DEFAULT_WS_BASE_URL;
    this.socketFactory = options.socketFactory ?? createWebSocket;
  }

  subscribe(): Promise<{ version: number; snapshot: unknown }> {
    if (this.subscribePromise) {
      return this.subscribePromise;
    }

    this.subscribePromise = new Promise((resolve, reject) => {
      this.pendingSubscription = { resolve, reject };
      this.ensureSocket();
    });

    return this.subscribePromise;
  }

  async submit(ops: Json0Op[]): Promise<void> {
    if (ops.length === 0) {
      throw new Error("ShareDB submit ops must not be empty.");
    }

    if (this.version === null) {
      throw new Error("ShareDB submit requires an active subscription.");
    }

    const version = this.version;
    const socket = this.ensureSocket();
    const seq = this.seq + 1;
    this.seq = seq;

    await new Promise<void>((resolve, reject) => {
      this.pendingSubmits.set(seq, { resolve, reject });
      socket.send(
        JSON.stringify({
          a: "op",
          c: COLLECTION,
          d: this.tripId,
          v: version,
          seq,
          op: ops,
        }),
      );
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  onRemoteOp(listener: RemoteOpListener): void {
    this.remoteOpListeners.add(listener);
  }

  private ensureSocket(): ShareDbSocketLike {
    if (this.socket) {
      return this.socket;
    }

    const socket = this.socketFactory({
      url: `${this.wsBaseUrl}/api/tripPlans/wsOverall/${encodeURIComponent(this.tripId)}?clientSchemaVersion=2`,
      headers: {
        Cookie: `connect.sid=${this.config.wanderlogCookie}`,
        Origin: this.baseUrl,
      },
    });
    this.socket = socket;

    socket.on("open", () => {
      socket.send(
        JSON.stringify({ a: "hs", id: null, protocol: 1, protocolMinor: 2 }),
      );
    });
    socket.on("message", (data) => this.handleMessage(data));
    socket.on("close", () => this.handleClose());
    socket.on("error", (error) => this.failAll(error));

    return socket;
  }

  private handleMessage(data: unknown): void {
    const frame = parseFrame(data);
    if (!frame) {
      return;
    }

    if (frame.error !== undefined) {
      this.failSubmit(frame.seq, new Error(formatFrameError(frame.error)));
      return;
    }

    if (frame.a === "hs") {
      this.socket?.send(
        JSON.stringify({ a: "s", c: COLLECTION, d: this.tripId }),
      );
      return;
    }

    if (frame.a === "s") {
      this.handleSubscription(frame);
      return;
    }

    if (frame.a === "op") {
      this.version = typeof frame.v === "number" ? frame.v : this.version;
      if (typeof frame.seq === "number") {
        this.resolveSubmit(frame.seq);
        return;
      }
      if (isJson0Ops(frame.op)) {
        this.notifyRemoteOp(frame.op);
      }
    }
  }

  private handleSubscription(frame: ShareDbFrame): void {
    const pending = this.pendingSubscription;
    if (!pending) {
      return;
    }

    const version = frame.data?.v;
    if (typeof version !== "number") {
      pending.reject(new Error("ShareDB subscription returned no version."));
      this.pendingSubscription = null;
      this.subscribePromise = null;
      return;
    }

    this.version = version;
    this.pendingSubscription = null;
    pending.resolve({ version, snapshot: frame.data?.data });
  }

  private resolveSubmit(seq: number): void {
    const pending = this.pendingSubmits.get(seq);
    if (!pending) {
      return;
    }

    this.pendingSubmits.delete(seq);
    pending.resolve();
  }

  private failSubmit(seq: number | undefined, error: Error): void {
    if (seq !== undefined) {
      const pending = this.pendingSubmits.get(seq);
      if (pending) {
        this.pendingSubmits.delete(seq);
        pending.reject(error);
        return;
      }
    }

    this.failAll(error);
  }

  private handleClose(): void {
    this.failAll(new Error("ShareDB socket closed."));
    this.socket = null;
  }

  private failAll(error: Error): void {
    this.pendingSubscription?.reject(error);
    this.pendingSubscription = null;
    this.subscribePromise = null;
    this.version = null;

    for (const [seq, pending] of this.pendingSubmits) {
      this.pendingSubmits.delete(seq);
      pending.reject(error);
    }
  }

  private notifyRemoteOp(ops: Json0Op[]): void {
    for (const listener of this.remoteOpListeners) {
      listener(ops);
    }
  }
}

function createWebSocket(input: {
  url: string;
  headers: Record<string, string>;
}): ShareDbSocketLike {
  return new WebSocket(input.url, {
    headers: input.headers,
  }) as ShareDbSocketLike;
}

function parseFrame(data: unknown): ShareDbFrame | null {
  const text = typeof data === "string" ? data : String(data);

  try {
    const frame = JSON.parse(text) as unknown;
    return isRecord(frame) ? (frame as ShareDbFrame) : null;
  } catch {
    return null;
  }
}

function formatFrameError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return "ShareDB request failed.";
}

function isJson0Ops(value: unknown): value is Json0Op[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
