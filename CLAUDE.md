# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Model Context Protocol (MCP) server that wraps the Rami Levy grocery store REST API so MCP-compatible clients (Claude Code, Claude Desktop, etc.) can shop conversationally — search the catalog, add/remove items, view the cart, and get a checkout link.

Two transports are supported from the same tool layer:
- **stdio** (`src/server.ts` → `dist/src/server.js`) — local Claude Code via `.mcp.json`
- **HTTP + OAuth2** (`src/remote.ts` → `dist/src/remote.js`) — Replit / web deployment with a `/login` page that collects Rami Levy credentials and issues bearer tokens

## Development Commands

```bash
npm run build          # tsc → dist/
npm run dev            # tsc --watch
npm run start          # Run stdio server (reads creds from .env)
npm run start:remote   # Run HTTP/OAuth server (MCP_PORT, default 5000)
npm run setup-auth     # Interactive token extractor (opens scripts/extract-tokens.html)
```

There is no test runner and no linter configured. TypeScript strict mode is the only static check (`tsc` via `npm run build`).

## Architecture

```
src/
├── server.ts      # stdio entrypoint — loads .env → createServer(creds) → StdioServerTransport
├── remote.ts      # HTTP entrypoint — Express + OAuth2 → per-session createServer(creds)
├── tools.ts       # Single source of truth for MCP tools (used by both transports)
├── types.ts       # Zod schemas + SimpleProduct conversion (toSimpleProduct)
├── auth.ts        # RamiLevyAuthProvider (in-memory OAuth: clients, codes, tokens) + loginPageHtml
└── api/
    ├── client.ts  # ramiLevyFetch() (auth headers + error handling), ramiLevyCurl() (PowerShell fallback)
    ├── search.ts  # POST /api/catalog
    └── cart.ts    # CartSession class — get/add/remove + browser sync
```

`tools.ts:createServer(creds)` is the heart: it instantiates one `CartSession` per server and registers the six MCP tools (`search_products`, `add_to_cart`, `remove_from_cart`, `get_cart`, `get_browser_sync_script`, `get_checkout_link`). Both `server.ts` and `remote.ts` call into this — credentials flow in from `.env` (stdio) or from the OAuth token's `extra` field (HTTP).

## Critical Domain Knowledge

**The Rami Levy cart API uses full-replacement semantics.** Every `POST /api/v2/cart` overwrites the entire cart. `CartSession` maintains `cachedItems` in memory so `add_to_cart` / `remove_from_cart` can merge against current state without spamming GETs. Consequence: **`remove_from_cart` requires the cache to be populated first** — it throws if you remove before calling `get_cart` (see `cart.ts:117-121`). If you add cart operations, preserve this invariant.

**Browser localStorage caches the cart separately from the API.** Even after a successful API write, `rami-levy.co.il` shows stale data until its `localStorage` is cleared. Mitigation:
- `CartSession.syncBrowser()` tries to inject a clear-cache script via Chrome DevTools Protocol on `localhost:9222`. This is **Windows-only** (uses PowerShell) and silently fails elsewhere.
- `get_browser_sync_script` tool returns a JS snippet the user can paste in DevTools.
- `scripts/extract-tokens.html` also ships a cart-sync bookmarklet.
- Every add/remove tool response includes a warning telling the user to sync the browser.

**Header spoofing matters.** `client.ts:getHeaders()` mimics Chrome 144 on Windows (User-Agent, sec-ch-ua, etc.). The site rejects requests with missing or non-browser-like headers. There is also `ramiLevyCurl()` — a PowerShell fallback used when Node `fetch` gets blocked. Don't simplify these headers without testing against the live site.

**Tokens expire and are not refreshed automatically.** When auth fails, `client.ts` throws `RamiLevyApiError`; the tool layer surfaces a "re-run `npm run setup-auth`" message. The setup flow is intentionally manual: the user installs a bookmarklet (`scripts/extract-tokens.html`), clicks it on `rami-levy.co.il` to base64-encode `{a: authToken, e: ecomToken, c: cookie}`, then pastes the blob into `scripts/setup-auth.ts` which decodes it into `.env`.

## Environment Variables

Stdio mode (`.env`):
```
RAMI_LEVY_AUTH_TOKEN=<bearer>      # required
RAMI_LEVY_ECOM_TOKEN=<ecomtoken>   # required
RAMI_LEVY_COOKIE=<session cookie>  # optional but recommended
RAMI_LEVY_STORE=331                # default store id
```

HTTP mode adds:
```
MCP_PORT=5000
MCP_HOST=0.0.0.0
MCP_BASE_URL=http://localhost:5000   # used as OAuth issuer URL
```

## Deployment

- **Local / Claude Code:** `.mcp.json` declares the stdio server with env passthrough. After `npm run build`, the client launches `node dist/src/server.js`.
- **Replit:** `.replit` runs `npm run start:remote` and exposes port 5000 → 80. The HTTP server's OAuth `/login` page collects credentials per-session; tokens are stored in memory only — **they vanish on restart**. If you need persistence, replace the in-memory maps in `auth.ts` (`clients`, `accessTokens`, `pendingAuthorizations`).

## Gotchas

- `playwright` is in `dependencies` but isn't used anywhere — safe to remove if you're trimming.
- Tool inputs accept an optional `store` parameter; if a session mixes store IDs across cart operations, the cart cache will desync. Keep the store ID consistent within a session.
- Search responses use Zod validation (`SearchResponseSchema`). The mapper `toSimpleProduct()` strips most fields for LLM consumption — if you need brand/department/images downstream, extend `SimpleProduct` rather than re-parsing raw API responses.
