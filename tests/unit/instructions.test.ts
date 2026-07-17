import { describe, expect, it } from "vitest";

import { WANDERLOG_SERVER_INSTRUCTIONS } from "../../src/instructions.js";

describe("WANDERLOG_SERVER_INSTRUCTIONS", () => {
  it("guides models to build practical day-by-day itineraries", () => {
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain(
      "Organize itineraries by day",
    );
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain(
      "Interleave places with practical notes",
    );
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("pre-trip checklist");
  });

  it("guides models through the v0.2 trip creation workflow", () => {
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_create_trip");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_search_places");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_search_guides");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_get_guide");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("one guide day");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_place");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_note");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_section");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_delete_section");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_hotel");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_checklist");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_remove_place");
  });

  it("keeps instructions concise enough for MCP startup", () => {
    expect(WANDERLOG_SERVER_INSTRUCTIONS.length).toBeLessThan(1800);
  });

  it("explains local draft CRUD tools", () => {
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("local drafts");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_list_drafts");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_export_drafts");
  });

  it("clarifies that local drafts are not yet live Wanderlog writes", () => {
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toMatch(
      /local drafts.*not.*live|not.*live.*local drafts/is,
    );
    expect(WANDERLOG_SERVER_INSTRUCTIONS).not.toMatch(/add-place.*local/i);
    expect(WANDERLOG_SERVER_INSTRUCTIONS).not.toMatch(/add-note.*local/i);
    expect(WANDERLOG_SERVER_INSTRUCTIONS).not.toMatch(/add-expense.*local/i);
    expect(WANDERLOG_SERVER_INSTRUCTIONS).not.toContain("The add-hotel tool");
  });

  it("does not describe draft storage as in-memory (regression guard)", () => {
    expect(WANDERLOG_SERVER_INSTRUCTIONS).not.toMatch(/in[- ]memory/i);
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("JSON file");
  });
});
