import { describe, expect, it } from "vitest";

import { ConfigError, readConfig } from "../../src/config.js";

describe("readConfig", () => {
  it("reads the Wanderlog cookie from the environment", () => {
    const config = readConfig({ WANDERLOG_COOKIE: "s%3Aabc.signature" });

    expect(config).toEqual({ wanderlogCookie: "s%3Aabc.signature" });
  });

  it("normalizes a copied connect.sid cookie assignment", () => {
    const config = readConfig({
      WANDERLOG_COOKIE: "connect.sid=s%3Aabc.signature",
    });

    expect(config).toEqual({ wanderlogCookie: "s%3Aabc.signature" });
  });

  it("rejects a missing Wanderlog cookie without exposing a secret", () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    expect(() => readConfig({})).toThrow(
      "Set WANDERLOG_COOKIE to your Wanderlog connect.sid cookie.",
    );
  });

  it("rejects an invalid cookie shape without echoing the value", () => {
    expect(() => readConfig({ WANDERLOG_COOKIE: "plain-cookie" })).toThrow(
      "WANDERLOG_COOKIE must look like a Wanderlog connect.sid value.",
    );
  });
});
