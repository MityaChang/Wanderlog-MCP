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
        ownTripPlans: [
          {
            id: 12345,
            key: "japan-golden-route-key",
            title: "Japan Golden Route",
            startDate: "2026-04-01",
            endDate: "2026-04-14",
            placeCount: 12,
          },
        ],
        friendsTripPlans: [],
        friendsPrivateSharedTripPlans: [],
      });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Aabc.signature" },
      fetchImpl,
    );

    await expect(client.listTrips()).resolves.toEqual([
      {
        id: "japan-golden-route-key",
        title: "Japan Golden Route",
        destination: null,
        startDate: "2026-04-01",
        endDate: "2026-04-14",
        url: "https://wanderlog.com/view/japan-golden-route-key",
      },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://wanderlog.com/api/tripPlans/home");
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

  it("throws a clear error when Wanderlog returns HTML instead of JSON", async () => {
    const fetchImpl = async (): Promise<Response> => {
      return new Response("<!DOCTYPE html><html>Sign in</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Asecret-cookie" },
      fetchImpl,
    );

    await expect(client.listTrips()).rejects.toThrow(
      "Wanderlog returned HTML instead of JSON. Check that WANDERLOG_COOKIE is fresh and the Wanderlog API path is still valid.",
    );
    await expect(client.listTrips()).rejects.not.toThrow("s%3Asecret-cookie");
    await expect(client.listTrips()).rejects.not.toThrow("<!DOCTYPE");
  });

  it("gets a trip detail with an optional day filter", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url, init });

      return Response.json({
        tripPlan: {
          id: "12345",
          key: "japan-golden-route-key",
          title: "Japan Golden Route",
          startDate: "2026-04-01",
          endDate: "2026-04-14",
          itinerary: {
            sections: [
              {
                id: 1,
                mode: "dayPlan",
                heading: "Arrival",
                date: "2026-04-01",
                blocks: [],
              },
              {
                id: 2,
                mode: "dayPlan",
                heading: "Museums",
                date: "2026-04-02",
                blocks: [],
              },
            ],
          },
        },
      });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Aabc.signature" },
      fetchImpl,
    );

    await expect(client.getTrip("12345", { day: 2 })).resolves.toMatchObject({
      id: "japan-golden-route-key",
      title: "Japan Golden Route",
      days: [{ day: 2, title: "Museums", date: "2026-04-02", items: [] }],
    });

    expect(calls[0]?.url).toBe(
      "https://wanderlog.com/api/tripPlans/12345?clientSchemaVersion=2&registerView=true",
    );
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.init?.headers).toEqual({
      accept: "application/json",
      cookie: "connect.sid=s%3Aabc.signature",
    });
  });
});
