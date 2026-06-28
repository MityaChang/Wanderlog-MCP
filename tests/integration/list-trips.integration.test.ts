import { describe, expect, it } from "vitest";

import { readConfig } from "../../src/config.js";
import { WanderlogClient } from "../../src/wanderlog/client.js";

const runIntegration = process.env.RUN_WANDERLOG_INTEGRATION === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration("wanderlog_list_trips integration", () => {
  it("lists trips from Wanderlog as an array", async () => {
    const client = new WanderlogClient(readConfig(process.env));

    await expect(client.listTrips()).resolves.toEqual(expect.any(Array));
  });
});
