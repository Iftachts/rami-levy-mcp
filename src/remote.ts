#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createServer } from "./tools.js";
import type { Credentials } from "./api/client.js";
import { RamiLevyAuthProvider, loginPageHtml } from "./auth.js";

const PORT = parseInt(process.env.MCP_PORT || "5000", 10);
const HOST = process.env.MCP_HOST || "0.0.0.0";

// The issuer URL is the logical identifier for the OAuth server.
// Use localhost so the SDK accepts HTTP without extra env flags.
const ISSUER_URL = new URL(
  process.env.MCP_BASE_URL || `http://localhost:${PORT}`,
);

// MCP server URL (the protected resource)
const MCP_SERVER_URL = new URL("/mcp", ISSUER_URL);

// ---------------------------------------------------------------------------
// OAuth provider
// ---------------------------------------------------------------------------

const provider = new RamiLevyAuthProvider();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = createMcpExpressApp({ host: HOST });

// Parse URL-encoded form bodies (for the /login POST)
app.use(express.urlencoded({ extended: false }));

// Mount OAuth endpoints: /authorize, /token, /register, /.well-known/*
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: ISSUER_URL,
    resourceServerUrl: MCP_SERVER_URL,
    scopesSupported: ["mcp:tools"],
  }),
);

// ---------------------------------------------------------------------------
// Login page — the user lands here after the OAuth /authorize redirect
// ---------------------------------------------------------------------------

app.get("/login", (req, res) => {
  const requestId = req.query.request_id as string | undefined;
  if (!requestId || !provider.getAuthRequest(requestId)) {
    res.status(400).json({ error: "Invalid or expired login request." });
    return;
  }
  res.type("html").send(loginPageHtml(requestId));
});

app.post("/login", (req, res) => {
  const { request_id, authToken, ecomToken, cookie, store } = req.body as {
    request_id?: string;
    authToken?: string;
    ecomToken?: string;
    cookie?: string;
    store?: string;
  };

  if (!request_id) {
    res.status(400).json({ error: "Missing request_id" });
    return;
  }

  const authReq = provider.getAuthRequest(request_id);
  if (!authReq) {
    res.status(400).json({ error: "Invalid or expired login request." });
    return;
  }

  if (!authToken || !ecomToken) {
    res.status(400).json({ error: "Auth Token and Ecom Token are required." });
    return;
  }

  const credentials: Credentials = {
    authToken,
    ecomToken,
    cookie: cookie || undefined,
    store: store || "331",
  };

  const code = provider.completeAuthorization(request_id, credentials);
  if (!code) {
    res.status(400).json({ error: "Failed to complete authorization." });
    return;
  }

  // Redirect back to the MCP client with the authorization code
  const redirectUrl = new URL(authReq.redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (authReq.state) {
    redirectUrl.searchParams.set("state", authReq.state);
  }
  res.redirect(redirectUrl.toString());
});

// ---------------------------------------------------------------------------
// MCP endpoint — protected by bearer auth
// ---------------------------------------------------------------------------

// Track active transports by session ID for cleanup
const transports = new Map<string, StreamableHTTPServerTransport>();

// All /mcp requests require a valid Bearer token
app.use("/mcp", requireBearerAuth({ verifier: provider }));

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

  // Extract Rami Levy credentials from the verified OAuth token
  const authInfo = req.auth!;
  const creds: Credentials = {
    authToken: authInfo.extra!.authToken as string,
    ecomToken: authInfo.extra!.ecomToken as string,
    cookie: (authInfo.extra!.cookie as string) || undefined,
    store: (authInfo.extra!.store as string) || "331",
  };

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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, HOST, () => {
  console.log(
    `Rami Levy MCP Server (remote) listening on http://${HOST}:${PORT}/mcp`,
  );
  console.log(`OAuth issuer: ${ISSUER_URL.href}`);
});
