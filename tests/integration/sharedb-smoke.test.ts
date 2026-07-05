import { describe, expect, it } from "vitest";

import { readConfig } from "../../src/config.js";
import { WanderlogClient } from "../../src/wanderlog/client.js";

const runIntegration = process.env.RUN_WANDERLOG_INTEGRATION === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required when RUN_WANDERLOG_INTEGRATION=1. Use a disposable Wanderlog trip and do not print or commit secrets.`,
    );
  }
  return value;
}

describeIntegration("ShareDB live mutation smoke", () => {
  it("renames a disposable day heading through the live mutation transport", async () => {
    const tripId = requireEnv("WANDERLOG_TRIP_KEY");
    const day = process.env.WANDERLOG_SMOKE_DAY ?? "day 1";
    const heading =
      process.env.WANDERLOG_SMOKE_HEADING ??
      `MCP smoke ${new Date().toISOString()}`;
    const client = new WanderlogClient(readConfig(process.env));

    await expect(
      client.renameDay({ tripId, day, heading }),
    ).resolves.toMatchObject({
      tripId,
      message: expect.stringContaining("Renamed day"),
    });
  });
});
