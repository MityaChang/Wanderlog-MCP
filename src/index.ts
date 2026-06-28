#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ConfigError, readConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  readConfig(process.env);

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
