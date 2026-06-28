import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server.ts";

describe("createServer", () => {
  it("creates an MCP server with a connect method", () => {
    const server = createServer({
      getTrip: async () => null,
      listTrips: async () => [],
    });

    expect(typeof server.connect).toBe("function");
  });
});
