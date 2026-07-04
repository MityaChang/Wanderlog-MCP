import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { JsonDraftItineraryStore } from "../../src/drafts/store.js";

const tempDirs: string[] = [];

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "wanderlog-drafts-"));
  tempDirs.push(dir);

  let id = 0;
  const store = new JsonDraftItineraryStore({
    filePath: join(dir, "drafts.json"),
    idGenerator: () => `draft-${++id}`,
    now: () => new Date("2026-07-04T08:00:00.000Z"),
  });

  return store;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("JsonDraftItineraryStore", () => {
  it("creates and lists draft items for one trip", async () => {
    const store = await createStore();

    const place = await store.create({
      kind: "place",
      tripId: "lisbon-key",
      place: "Time Out Market Lisboa",
      day: "2026-06-02",
      note: "Lunch stop.",
      startTime: "12:00",
      endTime: "13:00",
    });
    const note = await store.create({
      kind: "note",
      tripId: "lisbon-key",
      text: "Buy transit pass.",
      day: "2026-06-01",
    });
    await store.create({
      kind: "place",
      tripId: "porto-key",
      place: "Clerigos Tower",
    });

    await expect(store.list("lisbon-key")).resolves.toEqual([place, note]);
  });

  it("updates only the requested draft item", async () => {
    const store = await createStore();
    const draft = await store.create({
      kind: "hotel",
      tripId: "lisbon-key",
      hotel: "Hotel Lisboa",
      checkIn: "2026-06-01",
      checkOut: "2026-06-05",
    });

    await expect(
      store.update("lisbon-key", draft.draftId, {
        hotel: "Hotel Lisboa Plaza",
        checkOut: "2026-06-06",
      }),
    ).resolves.toMatchObject({
      draftId: "draft-1",
      hotel: "Hotel Lisboa Plaza",
      checkOut: "2026-06-06",
    });
  });

  it("deletes a draft item by trip and draft ID", async () => {
    const store = await createStore();
    const draft = await store.create({
      kind: "checklist",
      tripId: "lisbon-key",
      title: "Before flying",
      items: ["Passport", "Offline map"],
    });

    await expect(store.delete("lisbon-key", draft.draftId)).resolves.toEqual(
      draft,
    );
    await expect(store.list("lisbon-key")).resolves.toEqual([]);
  });

  it("exports draft items as assistant-readable text", async () => {
    const store = await createStore();

    await store.create({
      kind: "expense",
      tripId: "lisbon-key",
      title: "Dinner deposit",
      amount: 80,
      currency: "EUR",
      paidBy: "Alex",
      splitWith: ["Alex", "Sam"],
      note: "Refund if cancelled.",
    });

    await expect(store.exportTrip("lisbon-key")).resolves.toBe(
      "Local Wanderlog drafts for trip lisbon-key\n" +
        "- draft-1 [expense] Dinner deposit: EUR 80, paid by Alex, split with Alex, Sam. Refund if cancelled.",
    );
  });

  it("exports per-day checklist drafts with their day", async () => {
    const store = await createStore();

    await store.create({
      kind: "checklist",
      tripId: "lisbon-key",
      title: "Sintra day trip",
      items: ["Train tickets", "Palace timed entry"],
      day: "day 3",
    });

    await expect(store.exportTrip("lisbon-key")).resolves.toBe(
      "Local Wanderlog drafts for trip lisbon-key\n" +
        "- draft-1 [checklist] Sintra day trip on day 3: Train tickets, Palace timed entry",
    );
  });

  it("creates parent directory if it does not exist", async () => {
    const base = await mkdtemp(join(tmpdir(), "wanderlog-drafts-"));
    tempDirs.push(base);

    let id = 0;
    const store = new JsonDraftItineraryStore({
      filePath: join(base, "nested", "sub", "drafts.json"),
      idGenerator: () => `draft-${++id}`,
      now: () => new Date("2026-07-04T08:00:00.000Z"),
    });

    const draft = await store.create({
      kind: "note",
      tripId: "trip-1",
      text: "dir auto-created",
    });

    await expect(store.list("trip-1")).resolves.toEqual([draft]);
  });

  it("uses UUID v4 as default draftId when no idGenerator is injected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wanderlog-drafts-"));
    tempDirs.push(dir);

    const store = new JsonDraftItineraryStore({
      filePath: join(dir, "drafts.json"),
    });

    const draft = await store.create({
      kind: "note",
      tripId: "trip-uuid",
      text: "default id test",
    });

    expect(draft.draftId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("rejects with invalid JSON error when store file contains corrupt JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wanderlog-drafts-"));
    tempDirs.push(dir);
    const filePath = join(dir, "drafts.json");
    await writeFile(filePath, "{ not valid json }", "utf8");

    const store = new JsonDraftItineraryStore({ filePath });

    await expect(store.list("any-trip")).rejects.toThrow(
      "Local Wanderlog draft store contains invalid JSON.",
    );
  });

  it("strips cross-kind fields when updating a place draft", async () => {
    const store = await createStore();
    const place = await store.create({
      kind: "place",
      tripId: "lisbon-key",
      place: "Belem Tower",
    });

    const updated = await store.update("lisbon-key", place.draftId, {
      note: "Amazing view",
      text: "This should be stripped",
    });

    expect(updated).toHaveProperty("note", "Amazing view");
    expect(updated).not.toHaveProperty("text");

    const [listed] = await store.list("lisbon-key");
    expect(listed).toHaveProperty("note", "Amazing view");
    expect(listed).not.toHaveProperty("text");
  });

  it("concurrent creates preserve all written drafts", async () => {
    const store = await createStore();
    await Promise.all([
      store.create({ kind: "note", tripId: "trip-c", text: "a" }),
      store.create({ kind: "note", tripId: "trip-c", text: "b" }),
      store.create({ kind: "note", tripId: "trip-c", text: "c" }),
      store.create({ kind: "note", tripId: "trip-c", text: "d" }),
      store.create({ kind: "note", tripId: "trip-c", text: "e" }),
    ]);
    const listed = await store.list("trip-c");
    expect(listed).toHaveLength(5);
    const texts = listed.map((i) => (i as { text: string }).text).sort();
    expect(texts).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("does not write or update updatedAt when patch is entirely cross-kind", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wanderlog-drafts-"));
    tempDirs.push(dir);

    let nowMs = new Date("2026-07-04T08:00:00.000Z").getTime();
    let idCount = 0;
    const store = new JsonDraftItineraryStore({
      filePath: join(dir, "drafts.json"),
      idGenerator: () => `draft-${++idCount}`,
      now: () => new Date(nowMs),
    });

    const place = await store.create({
      kind: "place",
      tripId: "trip-x",
      place: "Torre de Belem",
    });

    // Advance clock so a spurious now() call inside update() would change updatedAt
    nowMs += 60_000;

    const returned = await store.update("trip-x", place.draftId, {
      text: "wrong kind",
    });
    expect(returned).toEqual(place);
    const [listed] = await store.list("trip-x");
    expect(listed).toEqual(place);
  });

  it("exportTrip returns header without trailing newline for empty trip", async () => {
    const store = await createStore();
    await expect(store.exportTrip("empty-trip")).resolves.toBe(
      "Local Wanderlog drafts for trip empty-trip",
    );
  });

  it("list() waits for a concurrent in-flight create to complete", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wanderlog-drafts-"));
    tempDirs.push(dir);

    let resolveBeforeWrite!: () => void;
    const blockBeforeWrite = new Promise<void>((resolve) => {
      resolveBeforeWrite = resolve;
    });

    let id = 0;
    const store = new JsonDraftItineraryStore({
      filePath: join(dir, "drafts.json"),
      idGenerator: () => `draft-${++id}`,
      now: () => new Date("2026-07-04T08:00:00.000Z"),
      beforeWrite: () => blockBeforeWrite,
    });

    // Start create — it blocks inside writeAll at the beforeWrite hook
    const createPromise = store.create({
      kind: "note",
      tripId: "trip-1",
      text: "blocked",
    });

    // Call list() while create is blocked; without fix it returns [] immediately
    const listPromise = store.list("trip-1");

    // Release the hook so create can complete
    resolveBeforeWrite();

    const [created, listed] = await Promise.all([createPromise, listPromise]);
    expect(listed).toEqual([created]);
  });

  it("writeAll leaves no .tmp files in the store directory after a successful write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wanderlog-drafts-"));
    tempDirs.push(dir);

    let id = 0;
    const store = new JsonDraftItineraryStore({
      filePath: join(dir, "drafts.json"),
      idGenerator: () => `draft-${++id}`,
      now: () => new Date("2026-07-04T08:00:00.000Z"),
    });

    await store.create({ kind: "note", tripId: "trip-1", text: "atomic" });

    const files = await readdir(dir);
    expect(files.filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
    expect(files).toContain("drafts.json");
  });

  it("throws a clear error for missing draft IDs", async () => {
    const store = await createStore();

    await expect(
      store.update("lisbon-key", "missing-draft", { note: "New note" }),
    ).rejects.toThrow(
      'No local Wanderlog draft "missing-draft" exists for trip lisbon-key.',
    );
    await expect(store.delete("lisbon-key", "missing-draft")).rejects.toThrow(
      'No local Wanderlog draft "missing-draft" exists for trip lisbon-key.',
    );
  });
});
