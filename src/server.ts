#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./tools.js";
import { credentialsFromEnv } from "./api/client.js";

const server = createServer(credentialsFromEnv());

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Rami Levy MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
