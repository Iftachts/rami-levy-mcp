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
  // For POST (new session initialization), create a new transport + server
  if (req.method === "POST" && !req.headers["mcp-session-id"]) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    const server = createServer();
    await server.connect(transport);

    const sid = transport.sessionId;
    if (sid) transports.set(sid, transport);

    await transport.handleRequest(req, res);
    return;
  }

  // For existing sessions, look up the transport
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId) {
    const transport = transports.get(sessionId);
    if (transport) {
      await transport.handleRequest(req, res);
      return;
    }
  }

  // Session not found or missing header
  res.status(400).json({ error: "Invalid or missing session" });
});

app.listen(PORT, HOST, () => {
  console.log(`Rami Levy MCP Server (remote) listening on http://${HOST}:${PORT}/mcp`);
});
