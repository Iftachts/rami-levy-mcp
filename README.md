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
git clone https://github.com/Iftachts/rami-levy-mcp.git
cd rami-levy-mcp
npm install
npm run build
```

### 2. Get your auth tokens

```bash
npm run setup-auth
```

This opens a helper page in your browser that guides you through token extraction:

1. Log in to [rami-levy.co.il](https://www.rami-levy.co.il/)
2. The helper page gives you a snippet to paste in the browser console
3. Do any action on the Rami Levy site (search, click, etc.)
4. The tokens are captured automatically and copied to your clipboard
5. Paste the code back into the setup script

The script creates your `.env` file automatically.

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

The Rami Levy website caches cart state locally. After making cart changes via the MCP server, you need to sync the browser.

Open `scripts/extract-tokens.html` in your browser — it includes a **"Sync Rami Levy Cart"** bookmarklet you can drag to your bookmarks bar. Click it on the Rami Levy site after any cart change to reload with the latest state.

Alternatively, open the cart in a fresh incognito window.

## Store IDs

The default store is `331`. You can change it via the `RAMI_LEVY_STORE` environment variable or pass `store` as a parameter to any tool.

## License

MIT
