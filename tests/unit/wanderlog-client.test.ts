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

  it("creates a trip by resolving the destination geo and posting the trip plan", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url, init });

      if (url.endsWith("/api/geo/autocomplete/Lisbon")) {
        return Response.json({
          data: [
            {
              id: 456,
              name: "Lisbon",
              countryName: "Portugal",
              latitude: 38.7223,
              longitude: -9.1393,
            },
          ],
        });
      }

      return Response.json({
        data: {
          key: "lisbon-key",
          viewKey: "lisbon-view",
          id: 789,
          title: "Lisbon Long Weekend",
        },
      });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Aabc.signature" },
      fetchImpl,
    );

    await expect(
      client.createTrip({
        destination: "Lisbon",
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        title: "Lisbon Long Weekend",
        privacy: "private",
      }),
    ).resolves.toEqual({
      id: "lisbon-key",
      numericId: 789,
      title: "Lisbon Long Weekend",
      destination: "Lisbon, Portugal",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      url: "https://wanderlog.com/view/lisbon-key",
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe("https://wanderlog.com/api/tripPlans");
    expect(calls[1]?.init?.method).toBe("POST");
    expect(calls[1]?.init?.headers).toEqual({
      accept: "application/json",
      "content-type": "application/json",
      cookie: "connect.sid=s%3Aabc.signature",
    });
    expect(calls[1]?.init?.body).toBe(
      JSON.stringify({
        geoIds: [456],
        initialMapsPlaceIds: [],
        initialEmailId: null,
        type: "plan",
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        privacy: "private",
        isMapEmbed: false,
        title: "Lisbon Long Weekend",
        language: "en",
      }),
    );
  });

  it("searches places with a geographically biased autocomplete request", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url, init });

      return Response.json({
        data: [
          {
            place_id: "place-123",
            description: "Time Out Market Lisboa, Lisbon, Portugal",
            structured_formatting: {
              main_text: "Time Out Market Lisboa",
              secondary_text: "Lisbon, Portugal",
            },
          },
        ],
      });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Aabc.signature" },
      fetchImpl,
    );

    await expect(
      client.searchPlaces({
        query: "food hall",
        latitude: 38.7223,
        longitude: -9.1393,
      }),
    ).resolves.toEqual([
      {
        id: "place-123",
        title: "Time Out Market Lisboa",
        description: "Lisbon, Portugal",
      },
    ]);

    expect(calls[0]?.url).toContain(
      "https://wanderlog.com/api/placesAPI/autocomplete/v2?request=",
    );
    expect(calls[0]?.init?.method).toBe("GET");
    const request = JSON.parse(
      decodeURIComponent(calls[0]?.url.split("request=")[1] ?? ""),
    ) as unknown;
    expect(request).toMatchObject({
      input: "food hall",
      location: { latitude: 38.7223, longitude: -9.1393 },
      radius: 15000,
      language: "en",
    });
  });

  it("searches public Wanderlog guides by resolving a destination geo", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url, init });

      if (url.endsWith("/api/geo/autocomplete/Vietnam")) {
        return Response.json({
          data: [
            {
              id: 86655,
              name: "Vietnam",
              countryName: null,
              popularity: 100,
            },
          ],
        });
      }

      return Response.json({
        data: {
          geoWithGoodGuides: {
            id: 86655,
            name: "Vietnam",
            countryName: null,
            guides: [
              {
                key: "guide-key",
                title: "Vietnam Loop",
                user: { username: "traveler" },
                placeCount: 42,
                viewCount: 1234,
                likeCount: 56,
                authorBlurb: "A practical route.",
                editedAt: "2026-05-03T02:05:37+00:00",
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

    await expect(
      client.searchGuides({ destination: "Vietnam" }),
    ).resolves.toEqual({
      geo: { id: 86655, name: "Vietnam", country: null },
      guides: [
        {
          id: "guide-key",
          title: "Vietnam Loop",
          author: "traveler",
          placeCount: 42,
          viewCount: 1234,
          likeCount: 56,
          blurb: "A practical route.",
          editedAt: "2026-05-03T02:05:37+00:00",
          url: "https://wanderlog.com/view/guide-key",
        },
      ],
    });

    expect(calls.map((call) => call.url)).toEqual([
      "https://wanderlog.com/api/geo/autocomplete/Vietnam",
      "https://wanderlog.com/api/tripPlans/browse/guides/86655",
    ]);
  });

  it("keeps the resolved destination geo when the guides response omits its id", async () => {
    const fetchImpl = async (url: string): Promise<Response> => {
      if (url.endsWith("/api/geo/autocomplete/Vietnam")) {
        return Response.json({
          data: [
            {
              id: 86655,
              name: "Vietnam",
              countryName: null,
              popularity: 100,
            },
          ],
        });
      }

      return Response.json({
        data: {
          geoWithGoodGuides: {
            name: "Vietnam",
            countryName: null,
            guides: [],
          },
        },
      });
    };

    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Aabc.signature" },
      fetchImpl,
    );

    await expect(
      client.searchGuides({ destination: "Vietnam" }),
    ).resolves.toEqual({
      geo: { id: 86655, name: "Vietnam", country: null },
      guides: [],
    });
  });

  it("throws a clear error when no guide destination geo is found", async () => {
    const fetchImpl = async (): Promise<Response> =>
      Response.json({ data: [] });
    const client = new WanderlogClient(
      { wanderlogCookie: "s%3Aabc.signature" },
      fetchImpl,
    );

    await expect(
      client.searchGuides({ destination: "Nowhere" }),
    ).rejects.toThrow("No Wanderlog destination found for Nowhere.");
  });

  it("gets public guide content without appending the trip-view registration parameter", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url, init });

      return Response.json({
        tripPlan: {
          key: "guide-key",
          title: "Vietnam Loop",
          itinerary: {
            sections: [
              {
                heading: "Hanoi",
                date: "2026-06-01",
                blocks: [
                  {
                    type: "place",
                    title: "Old Quarter",
                    note: "Start early.",
                  },
                ],
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

    await expect(client.getGuide("guide-key")).resolves.toMatchObject({
      id: "guide-key",
      title: "Vietnam Loop",
      days: [
        {
          day: 1,
          title: "Hanoi",
          items: [{ title: "Old Quarter", note: "Start early." }],
        },
      ],
    });

    expect(calls[0]?.url).toBe(
      "https://wanderlog.com/api/tripPlans/guide-key?clientSchemaVersion=2",
    );
  });

  it("gets public guide content with an optional day filter", async () => {
    const fetchImpl = async (): Promise<Response> => {
      return Response.json({
        tripPlan: {
          key: "guide-key",
          title: "Vietnam Loop",
          itinerary: {
            sections: [
              {
                heading: "Hanoi",
                date: "2026-06-01",
                blocks: [{ type: "place", title: "Old Quarter" }],
              },
              {
                heading: "Hue",
                date: "2026-06-02",
                blocks: [{ type: "place", title: "Imperial City" }],
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

    await expect(
      client.getGuide("guide-key", { day: 2 }),
    ).resolves.toMatchObject({
      id: "guide-key",
      title: "Vietnam Loop",
      days: [
        {
          day: 2,
          title: "Hue",
          items: [{ title: "Imperial City" }],
        },
      ],
    });
  });
});
