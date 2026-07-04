import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────────

type PlaceDraft = {
  kind: "place";
  place: string;
  day?: string;
  note?: string;
  startTime?: string;
  endTime?: string;
};

type NoteDraft = {
  kind: "note";
  text: string;
  day?: string;
};

type HotelDraft = {
  kind: "hotel";
  hotel: string;
  checkIn?: string;
  checkOut?: string;
};

type ChecklistDraft = {
  kind: "checklist";
  title: string;
  items: string[];
  day?: string;
};

type ExpenseDraft = {
  kind: "expense";
  title: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitWith: string[];
  note?: string;
};

type DraftKindData =
  | PlaceDraft
  | NoteDraft
  | HotelDraft
  | ChecklistDraft
  | ExpenseDraft;

export type DraftItem = DraftKindData & {
  draftId: string;
  tripId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateDraftInput = DraftKindData & { tripId: string };

export type DraftUpdatePatch = Partial<{
  place: string;
  day: string;
  note: string;
  startTime: string;
  endTime: string;
  text: string;
  hotel: string;
  checkIn: string;
  checkOut: string;
  title: string;
  items: string[];
  amount: number;
  currency: string;
  paidBy: string;
  splitWith: string[];
}>;

// ── Interface ──────────────────────────────────────────────────────────────────

export interface DraftItineraryStore {
  create(input: CreateDraftInput): Promise<DraftItem>;
  list(tripId: string): Promise<DraftItem[]>;
  update(
    tripId: string,
    draftId: string,
    patch: DraftUpdatePatch,
  ): Promise<DraftItem>;
  delete(tripId: string, draftId: string): Promise<DraftItem>;
  exportTrip(tripId: string): Promise<string>;
}

// ── JSON persistence ───────────────────────────────────────────────────────────

interface JsonDraftItineraryStoreOptions {
  filePath: string;
  idGenerator?: () => string;
  now?: () => Date;
  /**
   * @internal
   * Test-only hook invoked immediately before each atomic file write.
   * Not part of the public {@link DraftItineraryStore} interface and must not
   * be relied upon by production callers.
   */
  beforeWrite?: () => Promise<void>;
}

export class JsonDraftItineraryStore implements DraftItineraryStore {
  private readonly filePath: string;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;
  private readonly beforeWrite?: () => Promise<void>;
  private _queue: Promise<void> = Promise.resolve();

  constructor(options: JsonDraftItineraryStoreOptions) {
    this.filePath = options.filePath;
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
    this.beforeWrite = options.beforeWrite;
  }

  // Serialize mutating operations to prevent concurrent read-modify-write races
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this._queue.then(fn);
    this._queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async readAll(): Promise<DraftItem[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") return [];
      throw err;
    }
    try {
      return JSON.parse(raw) as DraftItem[];
    } catch {
      throw new Error("Local Wanderlog draft store contains invalid JSON.");
    }
  }

  private async writeAll(items: DraftItem[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const json = JSON.stringify(items, null, 2);
    if (this.beforeWrite) await this.beforeWrite();
    const tempPath = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(tempPath, json, "utf8");
    await rename(tempPath, this.filePath);
  }

  private async waitForPendingMutations(): Promise<void> {
    await this._queue;
  }

  private findItem(
    items: DraftItem[],
    tripId: string,
    draftId: string,
  ): DraftItem {
    const item = items.find(
      (i) => i.tripId === tripId && i.draftId === draftId,
    );
    if (!item) {
      throw new Error(
        `No local Wanderlog draft "${draftId}" exists for trip ${tripId}.`,
      );
    }
    return item;
  }

  // ── DraftItineraryStore ──────────────────────────────────────────────────────

  async create(input: CreateDraftInput): Promise<DraftItem> {
    return this.enqueue(async () => {
      const items = await this.readAll();
      const { tripId, ...rest } = input;
      const now = this.now().toISOString();
      const item: DraftItem = {
        ...(rest as DraftKindData),
        draftId: this.idGenerator(),
        tripId,
        createdAt: now,
        updatedAt: now,
      };
      items.push(item);
      await this.writeAll(items);
      return item;
    });
  }

  async list(tripId: string): Promise<DraftItem[]> {
    await this.waitForPendingMutations();
    const items = await this.readAll();
    return items.filter((i) => i.tripId === tripId);
  }

  async update(
    tripId: string,
    draftId: string,
    patch: DraftUpdatePatch,
  ): Promise<DraftItem> {
    return this.enqueue(async () => {
      const items = await this.readAll();
      const item = this.findItem(items, tripId, draftId);
      const cleanPatch = stripCrossKindFields(item.kind, patch);
      if (Object.keys(cleanPatch).length === 0) return item;
      const updated = {
        ...item,
        ...(cleanPatch as Partial<DraftItem>),
        draftId: item.draftId,
        tripId: item.tripId,
        kind: item.kind,
        createdAt: item.createdAt,
        updatedAt: this.now().toISOString(),
      } as DraftItem;
      const index = items.indexOf(item);
      items[index] = updated;
      await this.writeAll(items);
      return updated;
    });
  }

  async delete(tripId: string, draftId: string): Promise<DraftItem> {
    return this.enqueue(async () => {
      const items = await this.readAll();
      const item = this.findItem(items, tripId, draftId);
      const filtered = items.filter((i) => i !== item);
      await this.writeAll(filtered);
      return item;
    });
  }

  async exportTrip(tripId: string): Promise<string> {
    const items = await this.list(tripId);
    const header = `Local Wanderlog drafts for trip ${tripId}`;
    if (items.length === 0) return header;
    const lines = items.map((item) => `- ${item.draftId} ${formatItem(item)}`);
    return `${header}\n${lines.join("\n")}`;
  }
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function formatItem(item: DraftItem): string {
  switch (item.kind) {
    case "place": {
      const parts = [`[place] ${item.place}`];
      if (item.day) parts.push(`on ${item.day}`);
      if (item.startTime && item.endTime)
        parts.push(`${item.startTime}–${item.endTime}`);
      if (item.note) parts.push(item.note);
      return parts.join(", ");
    }
    case "note": {
      const parts = [`[note] ${item.text}`];
      if (item.day) parts.push(`on ${item.day}`);
      return parts.join(", ");
    }
    case "hotel": {
      const parts = [`[hotel] ${item.hotel}`];
      if (item.checkIn) parts.push(`check-in ${item.checkIn}`);
      if (item.checkOut) parts.push(`check-out ${item.checkOut}`);
      return parts.join(", ");
    }
    case "checklist": {
      const day = item.day ? ` on ${item.day}` : "";
      return `[checklist] ${item.title}${day}: ${item.items.join(", ")}`;
    }
    case "expense": {
      const base = `[expense] ${item.title}: ${item.currency} ${item.amount}, paid by ${item.paidBy}, split with ${item.splitWith.join(", ")}`;
      return item.note ? `${base}. ${item.note}` : base;
    }
  }
}

// ── Kind-aware patch filtering ─────────────────────────────────────────────────

const VALID_FIELDS_BY_KIND: Record<DraftKindData["kind"], Set<string>> = {
  place: new Set(["place", "day", "note", "startTime", "endTime"]),
  note: new Set(["text", "day"]),
  hotel: new Set(["hotel", "checkIn", "checkOut"]),
  checklist: new Set(["title", "items", "day"]),
  expense: new Set([
    "title",
    "amount",
    "currency",
    "paidBy",
    "splitWith",
    "note",
  ]),
};

function stripCrossKindFields(
  kind: DraftKindData["kind"],
  patch: DraftUpdatePatch,
): DraftUpdatePatch {
  const valid = VALID_FIELDS_BY_KIND[kind];
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => valid.has(key)),
  ) as DraftUpdatePatch;
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createDefaultDraftItineraryStore(): DraftItineraryStore {
  return new JsonDraftItineraryStore({
    filePath: join(homedir(), ".wanderlog-itinerary-mcp", "drafts.json"),
  });
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
