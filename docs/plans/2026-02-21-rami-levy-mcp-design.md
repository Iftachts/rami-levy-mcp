# Rami Levy MCP Server - Design Document

## Overview

A TypeScript MCP server that exposes Rami Levy's grocery e-commerce API as tools for LLM-powered conversational shopping. The user gives a shopping list in natural language, the LLM searches products, presents options, and manages the cart. The user completes payment manually via the checkout URL.

## Architecture

```
Claude Code / Claude Desktop (MCP Client)
        │ stdio (MCP protocol)
        ▼
rami-levy-mcp-server
  Tools: search_products, add_to_cart, remove_from_cart, get_cart, get_checkout_link
  Auth: .env file with manually-extracted tokens
        │ HTTPS (fetch)
        ▼
Rami Levy API
  POST /api/catalog     (search)
  POST /api/v2/cart     (cart write - full replacement)
  GET  /api/v2/cart     (cart read)
```

## API Details

### Authentication

Three values extracted from browser DevTools after logging into rami-levy.co.il:
- `RAMI_LEVY_AUTH_TOKEN` - Bearer token from Authorization header
- `RAMI_LEVY_ECOM_TOKEN` - ecomtoken header value
- `RAMI_LEVY_COOKIE` - full cookie header value

Tokens expire periodically and must be refreshed manually.

### Endpoints

**Search:** `POST https://www.rami-levy.co.il/api/catalog`
- Body: `{"q": "search query", "aggs": 1, "store": "331"}`
- Headers: Authorization (Bearer), ecomtoken, cookie, locale: "he"
- Returns: `{data: Product[], total: number, status: number}`

**Cart write:** `POST https://www.rami-levy.co.il/api/v2/cart`
- Body: `{"store": "331", "isClub": 0, "supplyAt": "ISO date", "items": {"productId": "quantity", ...}, "meta": null}`
- Full replacement semantics: every POST overwrites the entire cart
- Returns: `{items: CartItem[], price: number, discount: number, quantity: number, status: number}`

**Cart read:** `GET https://www.rami-levy.co.il/api/v2/cart`
- Same auth headers
- Returns current cart state

**Checkout:** Static URL `https://www.rami-levy.co.il/he/dashboard/checkout`

## Tools

| Tool | Inputs | Behavior | Returns |
|------|--------|----------|---------|
| `search_products` | `query` (string), `store?` (string) | POST /api/catalog | `{id, name, price, brand, image_url}[]` |
| `add_to_cart` | `store` (string), `items` ({id, quantity}[]) | GET current cart, merge new items, POST full cart | Cart summary |
| `remove_from_cart` | `store` (string), `item_ids` (number[]) | GET current cart, filter out items, POST full cart | Cart summary |
| `get_cart` | none | GET /api/v2/cart | Current cart with prices |
| `get_checkout_link` | none | Return static URL | Checkout URL string |

### Cart merge logic

Since the API does full cart replacement:
- **add_to_cart**: GET cart → merge new items (add quantities if product already exists, append if new) → POST
- **remove_from_cart**: GET cart → remove specified item IDs → POST remaining items

## Project Structure

```
/mnt/c/projects/shopping/
├── package.json
├── tsconfig.json
├── .env                  # tokens + store ID (gitignored)
├── .env.example          # template
├── .gitignore
├── src/
│   ├── server.ts         # MCP server setup, tool routing
│   ├── api/
│   │   ├── client.ts     # shared fetch wrapper with auth headers
│   │   ├── search.ts     # search_products
│   │   └── cart.ts       # add_to_cart, remove_from_cart, get_cart
│   └── types.ts          # Zod schemas, TS types
└── scripts/
    └── setup-auth.ts     # interactive auth helper
```

## Auth Helper (`npm run setup-auth`)

1. Opens rami-levy.co.il in default browser
2. Prints DevTools instructions for extracting tokens
3. Prompts for each token via readline
4. Optionally prompts for store ID (default: 331)
5. Writes .env file

## Dependencies

- `@modelcontextprotocol/sdk` - MCP server framework
- `zod` - schema validation
- `dotenv` - .env loading
- `open` - open browser for auth setup

Node 18+ required for native fetch.

## Error Handling

- 401/403 → "Auth tokens expired. Run `npm run setup-auth` to refresh."
- Network errors → propagate through MCP error response
- Empty search → return empty array, LLM handles messaging

## Decisions

- **Approach 3 chosen**: Manual auth with helper script + direct API. No Puppeteer dependency.
- **Minimal scope**: search, cart CRUD, checkout link. No saved lists, price tracking, or store search (can add later).
- **TypeScript**: matches existing ecosystem (MCP SDK, reference project).
