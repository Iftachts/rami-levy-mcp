# Rami Levy MCP Server

An MCP (Model Context Protocol) server for [Rami Levy](https://www.rami-levy.co.il/) online grocery shopping. Search products, manage your cart, and checkout — all from Claude.

Works with **Claude Desktop**, **Claude Code (CLI)**, **Claude Code Desktop**, and **Claude Cowork (Agent SDK)**.

## Features

- **Search products** — search the Rami Levy catalog in Hebrew or English
- **Add to cart** — add products by ID and quantity
- **Remove from cart** — remove products from your cart
- **View cart** — see current cart contents and totals
- **Browser sync script** — get a JS snippet to sync the browser with API cart state
- **Checkout link** — get the URL to complete your purchase

## Prerequisites

- Node.js 18+
- A Rami Levy account

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/rami-levy-mcp.git
cd rami-levy-mcp
npm install
npm run build
```

### 2. Get your auth tokens

```bash
npm run setup-auth
```

This will open a browser for you to log in and capture your tokens.

Alternatively, you can manually extract tokens from your browser:
1. Log in to [rami-levy.co.il](https://www.rami-levy.co.il/)
2. Open DevTools (F12) > Network tab
3. Look for API requests to `www-api.rami-levy.co.il`
4. Copy the `Authorization` header value (without "Bearer ") as `RAMI_LEVY_AUTH_TOKEN`
5. Copy the `ecom-token` header value as `RAMI_LEVY_ECOM_TOKEN`
6. Copy the `Cookie` header value as `RAMI_LEVY_COOKIE`

### 3. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and paste your tokens.

## Usage

### Claude Code (CLI & Desktop)

The repo includes a `.mcp.json` file. Just open the project in Claude Code:

```bash
cd rami-levy-mcp
claude
```

The MCP server will be available automatically. Make sure your `.env` file has the tokens set.

Or add it manually:

```bash
claude mcp add --transport stdio rami-levy \
  --env RAMI_LEVY_AUTH_TOKEN=your_token \
  --env RAMI_LEVY_ECOM_TOKEN=your_ecom_token \
  --env RAMI_LEVY_COOKIE=your_cookie \
  --env RAMI_LEVY_STORE=331 \
  -- node /path/to/rami-levy-mcp/dist/src/server.js
```

### Claude Desktop / Cowork

Edit your config file:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rami-levy": {
      "command": "node",
      "args": ["/absolute/path/to/rami-levy-mcp/dist/src/server.js"],
      "env": {
        "RAMI_LEVY_AUTH_TOKEN": "your_auth_token",
        "RAMI_LEVY_ECOM_TOKEN": "your_ecom_token",
        "RAMI_LEVY_COOKIE": "your_cookie",
        "RAMI_LEVY_STORE": "331"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Claude Agent SDK (Cowork)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Search for milk in Rami Levy",
  options: {
    mcpServers: {
      "rami-levy": {
        command: "node",
        args: ["/path/to/rami-levy-mcp/dist/src/server.js"],
        env: {
          RAMI_LEVY_AUTH_TOKEN: "your_token",
          RAMI_LEVY_ECOM_TOKEN: "your_ecom_token",
          RAMI_LEVY_COOKIE: "your_cookie",
          RAMI_LEVY_STORE: "331"
        }
      }
    },
    allowedTools: ["mcp__rami-levy__*"]
  }
})) {
  // handle messages
}
```

## Browser Sync

The Rami Levy website caches cart state locally. After making cart changes via the MCP server, you need to sync the browser. Options:

1. **Bookmarklet** — create a bookmark with this URL:
   ```
   javascript:void(function(){var d=JSON.parse(localStorage.ramilevy);d.cart={items:[],loaded:false};localStorage.ramilevy=JSON.stringify(d);location.reload();}())
   ```

2. **Incognito tab** — open the Rami Levy cart in a fresh incognito window.

## Store IDs

The default store is `331`. You can change it via the `RAMI_LEVY_STORE` environment variable or pass `store` as a parameter to any tool.

## License

MIT
