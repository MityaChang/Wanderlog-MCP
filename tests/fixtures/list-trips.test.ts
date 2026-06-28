import { describe, expect, it } from "vitest";

import response from "./list-trips-response.json" with { type: "json" };
import { mapTripSummaries } from "../../src/wanderlog/client.js";

describe("mapTripSummaries", () => {
  it("maps sanitized Wanderlog trips into stable summaries", () => {
    expect(mapTripSummaries(response)).toEqual([
      {
        id: "12345",
        title: "Japan Golden Route",
        destination: "Japan",
        startDate: "2026-04-01",
        endDate: "2026-04-14",
        url: "https://wanderlog.com/view/12345/japan-golden-route",
      },
      {
        id: "demo-empty-fields",
        title: "Untimed Planning Ideas",
        destination: null,
        startDate: null,
        endDate: null,
        url: "https://wanderlog.com/view/demo-empty-fields",
      },
    ]);
  });
});
