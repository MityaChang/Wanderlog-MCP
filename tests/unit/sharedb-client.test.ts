import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import type { Json0Op } from "../../src/ot/apply.js";
import {
  ShareDbClient,
  type ShareDbSocketFactory,
  type ShareDbSocketLike,
} from "../../src/wanderlog/sharedb.js";

class FakeSocket extends EventEmitter implements ShareDbSocketLike {
  readonly sent: unknown[] = [];
  isClosed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.isClosed = true;
    this.emit("close");
  }

  open(): void {
    this.emit("open");
  }

  receive(frame: unknown): void {
    this.emit("message", JSON.stringify(frame));
  }
}

function createClient(socket: FakeSocket): ShareDbClient {
  const socketFactory: ShareDbSocketFactory = () => socket;

  return new ShareDbClient({ wanderlogCookie: "s%3Atest-cookie" }, "trip-key", {
    socketFactory,
  });
}

describe("ShareDbClient", () => {
  it("handshakes before subscribing to the trip document", async () => {
    const socket = new FakeSocket();
    const client = createClient(socket);
    const subscription = client.subscribe();

    socket.open();
    expect(socket.sent).toEqual([
      { a: "hs", id: null, protocol: 1, protocolMinor: 2 },
    ]);

    socket.receive({ a: "hs", id: "session-1" });
    expect(socket.sent).toContainEqual({
      a: "s",
      c: "tripPlans",
      d: "trip-key",
    });

    socket.receive({
      a: "s",
      c: "tripPlans",
      d: "trip-key",
      data: { v: 7, data: { title: "Live trip" } },
    });

    await expect(subscription).resolves.toEqual({
      version: 7,
      snapshot: { title: "Live trip" },
    });
  });

  it("submits ops with the subscribed version and resolves by matching seq", async () => {
    const socket = new FakeSocket();
    const client = createClient(socket);
    const subscription = client.subscribe();

    socket.open();
    socket.receive({ a: "hs", id: "session-1" });
    socket.receive({
      a: "s",
      c: "tripPlans",
      d: "trip-key",
      data: { v: 3, data: { title: "Draft" } },
    });
    await subscription;

    const submission = client.submit([{ p: ["title"], r: "Live" }]);

    expect(socket.sent).toContainEqual({
      a: "op",
      c: "tripPlans",
      d: "trip-key",
      v: 3,
      seq: 1,
      op: [{ p: ["title"], r: "Live" }],
    });

    socket.receive({ a: "op", c: "tripPlans", d: "trip-key", v: 4, seq: 1 });

    await expect(submission).resolves.toBeUndefined();
  });

  it("uses the acknowledged version for the next submit", async () => {
    const socket = new FakeSocket();
    const client = createClient(socket);
    const subscription = client.subscribe();

    socket.open();
    socket.receive({ a: "hs", id: "session-1" });
    socket.receive({
      a: "s",
      c: "tripPlans",
      d: "trip-key",
      data: { v: 3, data: { title: "Draft" } },
    });
    await subscription;

    const firstSubmission = client.submit([{ p: ["title"], r: "Live" }]);
    socket.receive({ a: "op", c: "tripPlans", d: "trip-key", v: 4, seq: 1 });
    await firstSubmission;

    const secondSubmission = client.submit([{ p: ["title"], r: "Live 2" }]);

    expect(socket.sent).toContainEqual({
      a: "op",
      c: "tripPlans",
      d: "trip-key",
      v: 4,
      seq: 2,
      op: [{ p: ["title"], r: "Live 2" }],
    });

    socket.receive({ a: "op", c: "tripPlans", d: "trip-key", v: 5, seq: 2 });
    await secondSubmission;
  });

  it("notifies listeners for remote op frames", async () => {
    const socket = new FakeSocket();
    const client = createClient(socket);
    const remoteOps: Json0Op[][] = [];
    const subscription = client.subscribe();

    client.onRemoteOp((ops) => remoteOps.push(ops));
    socket.open();
    socket.receive({ a: "hs", id: "session-1" });
    socket.receive({
      a: "s",
      c: "tripPlans",
      d: "trip-key",
      data: { v: 3, data: { title: "Draft" } },
    });
    await subscription;

    socket.receive({
      a: "op",
      c: "tripPlans",
      d: "trip-key",
      v: 4,
      op: [{ p: ["title"], r: "Remote" }],
    });

    expect(remoteOps).toEqual([[{ p: ["title"], r: "Remote" }]]);
  });

  it("rejects a submitted op when Wanderlog returns an error for its seq", async () => {
    const socket = new FakeSocket();
    const client = createClient(socket);
    const subscription = client.subscribe();

    socket.open();
    socket.receive({ a: "hs", id: "session-1" });
    socket.receive({
      a: "s",
      c: "tripPlans",
      d: "trip-key",
      data: { v: 3, data: { title: "Draft" } },
    });
    await subscription;

    const submission = client.submit([{ p: ["title"], r: "Live" }]);

    socket.receive({
      a: "op",
      c: "tripPlans",
      d: "trip-key",
      seq: 1,
      error: { message: "version rejected" },
    });

    await expect(submission).rejects.toThrow("version rejected");
  });

  it("rejects empty submit ops without sending a frame", async () => {
    const socket = new FakeSocket();
    const client = createClient(socket);

    await expect(client.submit([])).rejects.toThrow(/empty/i);
    expect(socket.sent).toEqual([]);
  });

  it("rejects non-empty submit ops before subscription", async () => {
    const socket = new FakeSocket();
    const client = createClient(socket);

    await expect(client.submit([{ p: ["title"], r: "Live" }])).rejects.toThrow(
      /subscription/i,
    );
    expect(socket.sent).toEqual([]);
  });

  it("requires a new subscription before submitting after close", async () => {
    const socket = new FakeSocket();
    const client = createClient(socket);
    const subscription = client.subscribe();

    socket.open();
    socket.receive({ a: "hs", id: "session-1" });
    socket.receive({
      a: "s",
      c: "tripPlans",
      d: "trip-key",
      data: { v: 3, data: { title: "Draft" } },
    });
    await subscription;

    client.close();

    await expect(client.submit([{ p: ["title"], r: "Live" }])).rejects.toThrow(
      /subscription/i,
    );
  });

  it("closes the underlying socket", () => {
    const socket = new FakeSocket();
    const client = createClient(socket);

    const subscription = client.subscribe();
    socket.open();

    client.close();

    expect(socket.isClosed).toBe(true);
    return expect(subscription).rejects.toThrow(/closed/i);
  });
});
