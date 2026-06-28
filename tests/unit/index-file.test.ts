import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("src/index.ts", () => {
  it("declares a node shebang for npm bin execution", () => {
    const source = readFileSync("src/index.ts", "utf8");

    expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
  });
});
