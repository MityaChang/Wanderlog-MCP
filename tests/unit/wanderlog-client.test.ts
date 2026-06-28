import { describe, expect, it } from "vitest";

import { WanderlogClient } from "../../src/wanderlog/client.js";

describe("WanderlogClient", () => {
  it("sends the Wanderlog cookie and maps trip responses", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url, init });

      return Response.json({
        trips: [
          {
            id: 12345,
            name: "Japan Golden Route",
            destination: "Japan",
            startDate: "2026-04-01",
            endDate: "2026-04-14",
            slug: "japan-golden-route",
          },
        ],
      });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Aabc.signature" },
      fetchImpl,
    );

    await expect(client.listTrips()).resolves.toEqual([
      {
        id: "12345",
        title: "Japan Golden Route",
        destination: "Japan",
        startDate: "2026-04-01",
        endDate: "2026-04-14",
        url: "https://wanderlog.com/view/12345/japan-golden-route",
      },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://wanderlog.com/api/trips");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.init?.headers).toEqual({
      accept: "application/json",
      cookie: "connect.sid=s%3Aabc.signature",
    });
  });

  it("throws status-only errors without exposing the cookie", async () => {
    const fetchImpl = async (): Promise<Response> => {
      return new Response("Unauthorized", { status: 401 });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Asecret-cookie" },
      fetchImpl,
    );

    await expect(client.listTrips()).rejects.toThrow(
      "Wanderlog request failed with status 401.",
    );
    await expect(client.listTrips()).rejects.not.toThrow("s%3Asecret-cookie");
  });

  it("gets a trip detail with an optional day filter", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url, init });

      return Response.json({
        trip: {
          id: "12345",
          name: "Japan Golden Route",
          destination: "Japan",
          startDate: "2026-04-01",
          endDate: "2026-04-14",
          days: [
            { day: 1, title: "Arrival", items: [] },
            { day: 2, title: "Museums", items: [] },
          ],
        },
      });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Aabc.signature" },
      fetchImpl,
    );

    await expect(client.getTrip("12345", { day: 2 })).resolves.toMatchObject({
      id: "12345",
      title: "Japan Golden Route",
      days: [{ day: 2, title: "Museums", date: null, items: [] }],
    });

    expect(calls[0]?.url).toBe("https://wanderlog.com/api/trips/12345");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.init?.headers).toEqual({
      accept: "application/json",
      cookie: "connect.sid=s%3Aabc.signature",
    });
  });
});
