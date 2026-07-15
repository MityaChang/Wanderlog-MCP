import { describe, expect, it } from "vitest";

import {
  parseOrdinal,
  resolvePlaceRef,
} from "../../src/wanderlog/resolvers/place-ref.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(sections: unknown[]): unknown {
  return { itinerary: { sections } };
}

function makeSection(
  date: string,
  heading: string,
  blocks: unknown[],
): unknown {
  return { mode: "dayPlan", date, heading, blocks };
}

function makePlaceBlock(
  name: string,
  hotel?: { checkIn: string; checkOut: string },
): unknown {
  const block: Record<string, unknown> = {
    type: "place",
    place: { name },
  };
  if (hotel) block.hotel = hotel;
  return block;
}

// ---------------------------------------------------------------------------
// parseOrdinal
// ---------------------------------------------------------------------------

describe("parseOrdinal", () => {
  it("parses numeric ordinal suffix: 1st", () => {
    expect(parseOrdinal("1st tokyo station")).toEqual({
      position: 1,
      rest: "tokyo station",
    });
  });

  it("parses numeric ordinal suffix: 2nd with multi-word rest", () => {
    expect(parseOrdinal("2nd fushimi inari")).toEqual({
      position: 2,
      rest: "fushimi inari",
    });
  });

  it("parses numeric ordinal suffix: 3rd", () => {
    expect(parseOrdinal("3rd shrine")).toEqual({ position: 3, rest: "shrine" });
  });

  it("parses numeric ordinal suffix: 4th", () => {
    expect(parseOrdinal("4th cafe")).toEqual({ position: 4, rest: "cafe" });
  });

  it("parses word ordinal: first", () => {
    expect(parseOrdinal("first stop")).toEqual({ position: 1, rest: "stop" });
  });

  it("parses word ordinal: second", () => {
    expect(parseOrdinal("second temple")).toEqual({
      position: 2,
      rest: "temple",
    });
  });

  it("parses word ordinal: tenth", () => {
    expect(parseOrdinal("tenth museum")).toEqual({
      position: 10,
      rest: "museum",
    });
  });

  it("parses last keyword", () => {
    expect(parseOrdinal("last station")).toEqual({
      position: "last",
      rest: "station",
    });
  });

  it("returns null when no ordinal prefix", () => {
    expect(parseOrdinal("tokyo station")).toBeNull();
  });

  it("returns null for bare 'last' with no rest", () => {
    expect(parseOrdinal("last")).toBeNull();
  });

  it("returns null for bare numeric ordinal with no rest", () => {
    expect(parseOrdinal("1st")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolvePlaceRef — empty / none
// ---------------------------------------------------------------------------

describe("resolvePlaceRef — none", () => {
  it("returns none for empty snapshot", () => {
    expect(resolvePlaceRef({}, "Tokyo Station")).toEqual({ kind: "none" });
  });

  it("returns none for snapshot with no sections", () => {
    expect(resolvePlaceRef(makeSnapshot([]), "Tokyo Station")).toEqual({
      kind: "none",
    });
  });

  it("returns none when no place matches", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [makePlaceBlock("Kyoto Station")]),
    ]);
    expect(resolvePlaceRef(snapshot, "Tokyo Station")).toEqual({
      kind: "none",
    });
  });

  it("returns none for empty ref string", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [makePlaceBlock("Tokyo Station")]),
    ]);
    expect(resolvePlaceRef(snapshot, "")).toEqual({ kind: "none" });
  });
});

// ---------------------------------------------------------------------------
// resolvePlaceRef — exact match
// ---------------------------------------------------------------------------

describe("resolvePlaceRef — exact match", () => {
  it("returns unique for a single exact-name match", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Arrival", [
        makePlaceBlock("Tokyo Station"),
        makePlaceBlock("Shibuya Crossing"),
      ]),
    ]);

    const result = resolvePlaceRef(snapshot, "Tokyo Station");

    expect(result).toMatchObject({
      kind: "unique",
      match: {
        sectionIndex: 0,
        blockIndex: 0,
        name: "Tokyo Station",
      },
    });
  });

  it("is case-insensitive for exact match", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [makePlaceBlock("Tokyo Station")]),
    ]);

    const result = resolvePlaceRef(snapshot, "TOKYO STATION");

    expect(result).toMatchObject({ kind: "unique", match: { blockIndex: 0 } });
  });

  it("collapses dashes in place name", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [
        makePlaceBlock("Roppongi Hills - Tokyo City View"),
      ]),
    ]);

    const result = resolvePlaceRef(snapshot, "Roppongi Hills Tokyo City View");

    expect(result).toMatchObject({ kind: "unique" });
  });

  it("returns the block reference in the match", () => {
    const block = makePlaceBlock("Senso-ji Temple");
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [block]),
    ]);

    const result = resolvePlaceRef(snapshot, "Senso-ji Temple");

    expect(result).toMatchObject({ kind: "unique" });
    if (result.kind === "unique") {
      expect(result.match.block).toBe(block);
    }
  });
});

// ---------------------------------------------------------------------------
// resolvePlaceRef — substring match
// ---------------------------------------------------------------------------

describe("resolvePlaceRef — substring match", () => {
  it("falls back to substring when no exact match exists", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [
        makePlaceBlock("Fushimi Inari Taisha Shrine"),
      ]),
    ]);

    const result = resolvePlaceRef(snapshot, "Fushimi Inari");

    expect(result).toMatchObject({
      kind: "unique",
      match: { name: "Fushimi Inari Taisha Shrine" },
    });
  });

  it("prefers exact match over substring when both candidates exist", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [
        makePlaceBlock("Tokyo Station Central"),
        makePlaceBlock("Tokyo Station"),
      ]),
    ]);

    // "Tokyo Station" exact match should win (not pick the substring one)
    const result = resolvePlaceRef(snapshot, "Tokyo Station");

    expect(result).toMatchObject({ kind: "unique", match: { blockIndex: 1 } });
  });
});

// ---------------------------------------------------------------------------
// resolvePlaceRef — ambiguous
// ---------------------------------------------------------------------------

describe("resolvePlaceRef — ambiguous", () => {
  it("returns ambiguous when multiple places share the same name", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [
        makePlaceBlock("Tokyo Station"),
        makePlaceBlock("Tokyo Station"),
      ]),
    ]);

    const result = resolvePlaceRef(snapshot, "Tokyo Station");

    expect(result).toMatchObject({
      kind: "ambiguous",
    });
    if (result.kind === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("returns ambiguous for substring match with two different blocks", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [
        makePlaceBlock("Kyoto Station East"),
        makePlaceBlock("Kyoto Station West"),
      ]),
    ]);

    const result = resolvePlaceRef(snapshot, "Kyoto Station");

    expect(result).toMatchObject({ kind: "ambiguous" });
    if (result.kind === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("caps ambiguous candidates at 10", () => {
    const blocks = Array.from({ length: 15 }, () =>
      makePlaceBlock("Duplicate Park"),
    );
    const snapshot = makeSnapshot([makeSection("2026-04-01", "Day 1", blocks)]);

    const result = resolvePlaceRef(snapshot, "Duplicate Park");

    expect(result).toMatchObject({ kind: "ambiguous" });
    if (result.kind === "ambiguous") {
      expect(result.candidates.length).toBeLessThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// resolvePlaceRef — ordinal prefixes
// ---------------------------------------------------------------------------

describe("resolvePlaceRef — ordinal", () => {
  function snapshotWithTwoIdenticalPlaces(): unknown {
    return makeSnapshot([
      makeSection("2026-04-01", "Day 1", [makePlaceBlock("Shrine")]),
      makeSection("2026-04-02", "Day 2", [makePlaceBlock("Shrine")]),
    ]);
  }

  it("picks the 1st match with numeric ordinal", () => {
    const result = resolvePlaceRef(
      snapshotWithTwoIdenticalPlaces(),
      "1st Shrine",
    );

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 0, blockIndex: 0 },
    });
  });

  it("picks the 2nd match with numeric ordinal", () => {
    const result = resolvePlaceRef(
      snapshotWithTwoIdenticalPlaces(),
      "2nd Shrine",
    );

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 1, blockIndex: 0 },
    });
  });

  it("picks the 1st match with word ordinal 'first'", () => {
    const result = resolvePlaceRef(
      snapshotWithTwoIdenticalPlaces(),
      "first Shrine",
    );

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 0 },
    });
  });

  it("picks the last match with 'last'", () => {
    const result = resolvePlaceRef(
      snapshotWithTwoIdenticalPlaces(),
      "last Shrine",
    );

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 1 },
    });
  });

  it("returns none when ordinal is out of range", () => {
    const result = resolvePlaceRef(
      snapshotWithTwoIdenticalPlaces(),
      "5th Shrine",
    );

    expect(result).toEqual({ kind: "none" });
  });

  it("returns none when ordinal target has no matches", () => {
    const result = resolvePlaceRef(
      snapshotWithTwoIdenticalPlaces(),
      "1st Nonexistent Place",
    );

    expect(result).toEqual({ kind: "none" });
  });
});

// ---------------------------------------------------------------------------
// resolvePlaceRef — compound <place> on <day>
// ---------------------------------------------------------------------------

describe("resolvePlaceRef — compound day filter", () => {
  function snapshotWithDuplicateAcrossDays(): unknown {
    return makeSnapshot([
      makeSection("2026-04-01", "Tokyo", [makePlaceBlock("Central Station")]),
      makeSection("2026-04-02", "Kyoto", [makePlaceBlock("Central Station")]),
    ]);
  }

  it("filters by 'day N' to pick the correct section", () => {
    const result = resolvePlaceRef(
      snapshotWithDuplicateAcrossDays(),
      "Central Station on day 1",
    );

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 0 },
    });
  });

  it("filters by 'day 2' to pick the second section", () => {
    const result = resolvePlaceRef(
      snapshotWithDuplicateAcrossDays(),
      "Central Station on day 2",
    );

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 1 },
    });
  });

  it("filters by ISO date", () => {
    const result = resolvePlaceRef(
      snapshotWithDuplicateAcrossDays(),
      "Central Station on 2026-04-02",
    );

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 1 },
    });
  });

  it("filters by section heading", () => {
    const result = resolvePlaceRef(
      snapshotWithDuplicateAcrossDays(),
      "Central Station on Tokyo",
    );

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 0 },
    });
  });

  it("returns none when context does not match any day", () => {
    const result = resolvePlaceRef(
      snapshotWithDuplicateAcrossDays(),
      "Central Station on Unknown Day",
    );

    expect(result).toEqual({ kind: "none" });
  });

  it("falls back to name matching when 'on' is part of a place name", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [
        makePlaceBlock("Bridge on the River Kwai"),
      ]),
    ]);

    const result = resolvePlaceRef(snapshot, "Bridge on the River Kwai");

    expect(result).toMatchObject({
      kind: "unique",
      match: { name: "Bridge on the River Kwai" },
    });
  });

  it("combines ordinal and compound: '2nd shrine on day 1'", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [
        makePlaceBlock("Shrine"),
        makePlaceBlock("Shrine"),
      ]),
      makeSection("2026-04-02", "Day 2", [makePlaceBlock("Shrine")]),
    ]);

    // "2nd shrine on day 1" → ordinal strips "2nd", body="shrine on day 1"
    // compound left="shrine", right="day 1" → both day-1 shrines
    // ordinal position 2 → second one in day 1
    const result = resolvePlaceRef(snapshot, "2nd shrine on day 1");

    expect(result).toMatchObject({
      kind: "unique",
      match: { sectionIndex: 0, blockIndex: 1 },
    });
  });
});

// ---------------------------------------------------------------------------
// resolvePlaceRef — hotel keyword
// ---------------------------------------------------------------------------

describe("resolvePlaceRef — hotel keyword", () => {
  function snapshotWithHotel(): unknown {
    return makeSnapshot([
      makeSection("2026-04-01", "Day 1", [
        makePlaceBlock("Tokyo Station"),
        makePlaceBlock("Grand Hyatt Tokyo", {
          checkIn: "2026-04-01",
          checkOut: "2026-04-03",
        }),
      ]),
    ]);
  }

  it("resolves 'the hotel' to the first place block with hotel metadata", () => {
    const result = resolvePlaceRef(snapshotWithHotel(), "the hotel");

    expect(result).toMatchObject({
      kind: "unique",
      match: { blockIndex: 1, name: "Grand Hyatt Tokyo" },
    });
  });

  it("resolves bare 'hotel' keyword", () => {
    const result = resolvePlaceRef(snapshotWithHotel(), "hotel");

    expect(result).toMatchObject({ kind: "unique", match: { blockIndex: 1 } });
  });

  it("resolves 'my hotel' keyword", () => {
    const result = resolvePlaceRef(snapshotWithHotel(), "my hotel");

    expect(result).toMatchObject({ kind: "unique", match: { blockIndex: 1 } });
  });

  it("returns none when no block has hotel metadata", () => {
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [makePlaceBlock("Tokyo Station")]),
    ]);

    expect(resolvePlaceRef(snapshot, "the hotel")).toEqual({ kind: "none" });
  });

  it("does not match a normal place named 'hotel' via hotel keyword path", () => {
    // A place named "Hotel" without hotel metadata should NOT match the keyword
    // path, but should match via exact/substring name matching instead.
    const snapshot = makeSnapshot([
      makeSection("2026-04-01", "Day 1", [makePlaceBlock("Grand Hotel")]),
    ]);

    // "hotel" keyword → looks for block.hotel metadata → none here
    // BUT "hotel" as substring → would find "Grand Hotel"
    // The hotel keyword path bypasses name matching entirely and returns [] if no metadata block.
    // Then name matching falls through: exact "hotel" ≠ "Grand Hotel"
    // substring "hotel" ⊂ "grand hotel" → unique
    const result = resolvePlaceRef(snapshot, "hotel");

    // "hotel" is in HOTEL_KEYWORDS so it goes through hotel-metadata path only → none
    expect(result).toEqual({ kind: "none" });
  });
});
