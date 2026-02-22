#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createServer } from "./tools.js";

const PORT = parseInt(process.env.MCP_PORT || "3000", 10);
const HOST = process.env.MCP_HOST || "0.0.0.0";

// Track active transports by session ID for cleanup
const transports = new Map<string, StreamableHTTPServerTransport>();

const app = createMcpExpressApp({ host: HOST });

// Handle all MCP requests (POST, GET, DELETE) on /mcp
app.all("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session — route to its transport
  if (sessionId) {
    const transport = transports.get(sessionId);
    if (transport) {
      await transport.handleRequest(req, res, req.body);
      return;
    }
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // New session — only POST (initialize) is allowed without a session header
  if (req.method !== "POST") {
    res.status(400).json({ error: "Missing mcp-session-id header" });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      transports.set(sid, transport);
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) transports.delete(sid);
  };

  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  console.log(`Rami Levy MCP Server (remote) listening on http://${HOST}:${PORT}/mcp`);
});
