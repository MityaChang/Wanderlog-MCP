import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenMarkers = ["WANDERLOG_COOKIE", "connect.sid", "s%3A"];

describe("fixture hygiene", () => {
  it("does not contain obvious Wanderlog cookie secrets", () => {
    const fixtureFiles = listFixtureFiles("tests/fixtures").filter(
      (filePath) => !filePath.endsWith(".test.ts"),
    );

    for (const filePath of fixtureFiles) {
      const content = readFileSync(filePath, "utf8");

      for (const marker of forbiddenMarkers) {
        expect(content).not.toContain(marker);
      }
    }
  });
});

function listFixtureFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    return stats.isDirectory() ? listFixtureFiles(path) : [path];
  });
}
