import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package hygiene", () => {
  it("keeps .env.example as a placeholder instead of a real cookie", () => {
    const envExample = readFileSync(".env.example", "utf8");
    const cookieLine = envExample
      .split("\n")
      .find((line) => line.startsWith("WANDERLOG_COOKIE="));

    expect(cookieLine).toBeDefined();
    expect(cookieLine).toContain("...");
  });
});
