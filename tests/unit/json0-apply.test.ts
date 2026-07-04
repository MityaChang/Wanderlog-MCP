import { describe, expect, it } from "vitest";

import { applyJson0, type Json0Op } from "../../src/ot/apply.js";

describe("applyJson0", () => {
  it("inserts, replaces, and deletes list items without mutating input", () => {
    const input = { sections: [{ title: "A" }, { title: "B" }] };
    const ops: Json0Op[] = [
      { p: ["sections", 1], li: { title: "New" } },
      { p: ["sections", 0], ld: { title: "A" }, li: { title: "First" } },
      { p: ["sections", 2], ld: { title: "B" } },
    ];

    const result = applyJson0(input, ops);

    expect(result.sections.map((section) => section.title)).toEqual([
      "First",
      "New",
    ]);
    expect(input.sections.map((section) => section.title)).toEqual(["A", "B"]);
  });

  it("applies object, string, number, move, and replace ops", () => {
    const input = {
      title: "Trip",
      count: 2,
      meta: { note: "hello" },
      blocks: [{ id: 1 }, { id: 2 }, { id: 3 }],
    };

    const result = applyJson0(input, [
      { p: ["title"], r: "Live Trip" },
      { p: ["count"], na: 3 },
      { p: ["meta", "note", 5], si: " there" },
      { p: ["meta", "note", 0], sd: "hello" },
      { p: ["meta", "status"], oi: "draft" },
      { p: ["meta", "status"], od: "draft", oi: "live" },
      { p: ["blocks", 0], lm: 2 },
    ]);

    expect(result).toMatchObject({
      title: "Live Trip",
      count: 5,
      meta: { note: " there", status: "live" },
    });
    expect(result.blocks.map((block) => block.id)).toEqual([2, 3, 1]);
  });

  it("throws clear path errors for invalid paths", () => {
    expect(() =>
      applyJson0({ sections: [] }, [{ p: ["sections", 1], li: {} }]),
    ).toThrow(/JSON0 op path/);
  });
});
