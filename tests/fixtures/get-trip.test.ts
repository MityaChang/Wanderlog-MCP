import { describe, expect, it } from "vitest";

import response from "./get-trip-response.json" with { type: "json" };
import { mapTripDetail } from "../../src/wanderlog/client.js";

describe("mapTripDetail", () => {
  it("maps a sanitized Wanderlog trip detail response", () => {
    expect(mapTripDetail(response)).toEqual({
      id: "12345",
      title: "Japan Golden Route",
      destination: "Japan",
      startDate: "2026-04-01",
      endDate: "2026-04-14",
      url: "https://wanderlog.com/view/12345/japan-golden-route",
      forwardingEmail: "trip+12345@wanderlog.com",
      days: [
        {
          day: 1,
          date: "2026-04-01",
          title: "Tokyo Arrival",
          items: [
            {
              type: "place",
              title: "Tokyo Station",
              note: "Pick up rail pass.",
              startTime: "10:00",
              endTime: "11:00",
            },
            {
              type: "note",
              title: "Transit note",
              note: "Use the airport express into the city.",
              startTime: null,
              endTime: null,
            },
          ],
        },
        {
          day: 2,
          date: "2026-04-02",
          title: "Museums",
          items: [],
        },
      ],
      generalItems: [
        {
          type: "checklist",
          title: "Pre-trip checklist",
          note: "Passport, rail pass, offline maps.",
          startTime: null,
          endTime: null,
        },
      ],
    });
  });

  it("can filter a mapped trip detail to one day", () => {
    expect(mapTripDetail(response, { day: 2 })?.days).toEqual([
      {
        day: 2,
        date: "2026-04-02",
        title: "Museums",
        items: [],
      },
    ]);
  });
});
