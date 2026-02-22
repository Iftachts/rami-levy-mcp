#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createServer } from "./tools.js";
import type { Credentials } from "./api/client.js";

const PORT = parseInt(process.env.MCP_PORT || "3000", 10);
const HOST = process.env.MCP_HOST || "0.0.0.0";

// Track active transports by session ID for cleanup
const transports = new Map<string, StreamableHTTPServerTransport>();

const app = createMcpExpressApp({ host: HOST });

/**
 * Extract per-user Rami Levy credentials from request headers.
 *
 * Users pass their credentials via custom HTTP headers when initialising a session:
 *   x-rami-auth-token   – Bearer auth token
 *   x-rami-ecom-token   – Ecom token
 *   x-rami-cookie        – Session cookie (optional)
 *   x-rami-store         – Store ID (optional, default "331")
 */
function extractCredentials(headers: Record<string, string | string[] | undefined>): Credentials {
  const get = (name: string): string | undefined => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };

  const authToken = get("x-rami-auth-token");
  const ecomToken = get("x-rami-ecom-token");

  if (!authToken || !ecomToken) {
    throw new Error(
      "Missing required headers: x-rami-auth-token and x-rami-ecom-token. " +
      "Pass your Rami Levy credentials as HTTP headers when connecting.",
    );
  }

  return {
    authToken,
    ecomToken,
    cookie: get("x-rami-cookie"),
    store: get("x-rami-store") || "331",
  };
}

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

  // Extract per-user credentials from the init request
  let creds: Credentials;
  try {
    creds = extractCredentials(req.headers);
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
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

  const server = createServer(creds);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  console.log(`Rami Levy MCP Server (remote) listening on http://${HOST}:${PORT}/mcp`);
});
