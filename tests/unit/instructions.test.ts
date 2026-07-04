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
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_place");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_note");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_hotel");
    expect(WANDERLOG_SERVER_INSTRUCTIONS).toContain("wanderlog_add_checklist");
  });

  it("keeps instructions concise enough for MCP startup", () => {
    expect(WANDERLOG_SERVER_INSTRUCTIONS.length).toBeLessThan(1800);
  });
});
