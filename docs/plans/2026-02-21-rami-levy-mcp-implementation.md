# Rami Levy MCP Server - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server that exposes Rami Levy's grocery API as tools, enabling LLM-powered conversational shopping (search products, manage cart, get checkout link).

**Architecture:** TypeScript MCP server using `@modelcontextprotocol/sdk` v1.26.0 with `McpServer.registerTool()`. Direct HTTPS calls to Rami Levy's REST API (`/api/catalog` for search, `/api/v2/cart` for cart). Auth tokens manually extracted from browser DevTools and stored in `.env`.

**Tech Stack:** TypeScript, Node 20, `@modelcontextprotocol/sdk`, `zod`, `dotenv`, `open`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/server.ts` (minimal placeholder)

**Step 1: Initialize package.json**

```bash
cd /mnt/c/projects/shopping
npm init -y
```

Then update `package.json` to:

```json
{
  "name": "rami-levy-mcp",
  "version": "1.0.0",
  "description": "MCP server for Rami Levy grocery shopping",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsc --watch",
    "setup-auth": "node dist/scripts/setup-auth.js"
  },
  "license": "MIT"
}
```

**Step 2: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk zod dotenv open
npm install -D typescript @types/node
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
```

**Step 5: Create .env.example**

```
RAMI_LEVY_AUTH_TOKEN=paste_bearer_token_here
RAMI_LEVY_ECOM_TOKEN=paste_ecom_token_here
RAMI_LEVY_COOKIE=paste_cookie_here
RAMI_LEVY_STORE=331
```

**Step 6: Create minimal src/server.ts**

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "rami-levy-mcp",
  version: "1.0.0",
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Rami Levy MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 7: Verify it compiles**

Run: `npm run build`
Expected: Clean compilation, `dist/` directory created with `server.js`

**Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example src/server.ts
git commit -m "feat: scaffold rami-levy-mcp project"
```

---

### Task 2: API Client & Types

**Files:**
- Create: `src/types.ts`
- Create: `src/api/client.ts`

**Step 1: Create src/types.ts with Zod schemas**

```typescript
import { z } from "zod";

// --- Search types ---

export const SearchProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.object({
    price: z.number(),
  }),
  images: z.object({
    small: z.string().optional(),
  }).optional(),
  brand: z.number().optional(),
  department: z.object({
    name: z.string(),
    id: z.number(),
  }).optional(),
  group: z.object({
    name: z.string(),
    id: z.number(),
  }).optional(),
  gs: z.object({
    BrandName: z.string().optional(),
    short_name: z.string().optional(),
    Net_Content: z.object({
      text: z.string(),
    }).optional(),
  }).optional(),
});

export const SearchResponseSchema = z.object({
  data: z.array(z.any()),
  total: z.number(),
  status: z.number(),
});

// --- Cart types ---

export const CartItemInputSchema = z.object({
  id: z.number().describe("Product ID"),
  quantity: z.number().min(1).describe("Quantity"),
});

export const CartResponseItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
  quantity: z.number(),
  FormatedTotalPrice: z.number(),
  FormatedSavePrice: z.number(),
  has_coupon: z.boolean(),
  is_delivery: z.boolean(),
  isClub: z.boolean(),
});

export const CartResponseSchema = z.object({
  items: z.array(CartResponseItemSchema),
  price: z.number(),
  priceClub: z.number(),
  discount: z.number(),
  quantity: z.number(),
  status: z.number(),
});

// --- Derived types ---

export type SearchProduct = z.infer<typeof SearchProductSchema>;
export type CartItemInput = z.infer<typeof CartItemInputSchema>;
export type CartResponse = z.infer<typeof CartResponseSchema>;
export type CartResponseItem = z.infer<typeof CartResponseItemSchema>;

// --- Simplified product for LLM display ---

export interface SimpleProduct {
  id: number;
  name: string;
  price: number;
  brand: string;
  size: string;
  image_url: string;
}

export function toSimpleProduct(raw: any): SimpleProduct {
  return {
    id: raw.id,
    name: raw.name,
    price: raw.price?.price ?? 0,
    brand: raw.gs?.BrandName ?? "",
    size: raw.gs?.Net_Content?.text ?? "",
    image_url: raw.images?.small
      ? `https://www.rami-levy.co.il${raw.images.small}`
      : "",
  };
}
```

**Step 2: Create src/api/client.ts**

```typescript
import "dotenv/config";

export class RamiLevyApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = "RamiLevyApiError";
  }
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new RamiLevyApiError(
      `Missing environment variable: ${key}. Run 'npm run setup-auth' to configure.`,
    );
  }
  return value;
}

export function getStore(): string {
  return process.env.RAMI_LEVY_STORE || "331";
}

function getHeaders(): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    authorization: `Bearer ${getRequiredEnv("RAMI_LEVY_AUTH_TOKEN")}`,
    ecomtoken: getRequiredEnv("RAMI_LEVY_ECOM_TOKEN"),
    cookie: getRequiredEnv("RAMI_LEVY_COOKIE"),
    locale: "he",
  };
}

export async function ramiLevyFetch(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const { method = "GET", body } = options;

  const response = await fetch(url, {
    method,
    headers: getHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 || response.status === 403) {
    throw new RamiLevyApiError(
      "Auth tokens expired or invalid. Run 'npm run setup-auth' to refresh.",
      response.status,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new RamiLevyApiError(
      `Rami Levy API error: ${response.status} ${response.statusText}`,
      response.status,
      text,
    );
  }

  return response.json();
}
```

**Step 3: Verify it compiles**

Run: `npm run build`
Expected: Clean compilation

**Step 4: Commit**

```bash
git add src/types.ts src/api/client.ts
git commit -m "feat: add API client and type definitions"
```

---

### Task 3: Search Products Tool

**Files:**
- Create: `src/api/search.ts`
- Modify: `src/server.ts`

**Step 1: Create src/api/search.ts**

```typescript
import { ramiLevyFetch, getStore } from "./client.js";
import { SearchResponseSchema, toSimpleProduct, type SimpleProduct } from "../types.js";

const CATALOG_URL = "https://www.rami-levy.co.il/api/catalog";

export async function searchProducts(
  query: string,
  store?: string,
): Promise<{ products: SimpleProduct[]; total: number }> {
  const response = await ramiLevyFetch(CATALOG_URL, {
    method: "POST",
    body: {
      q: query,
      aggs: 1,
      store: store || getStore(),
    },
  });

  const parsed = SearchResponseSchema.parse(response);
  return {
    products: parsed.data.map(toSimpleProduct),
    total: parsed.total,
  };
}
```

**Step 2: Register search_products tool in src/server.ts**

Replace `src/server.ts` with:

```typescript
#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchProducts } from "./api/search.js";

const server = new McpServer({
  name: "rami-levy-mcp",
  version: "1.0.0",
});

// --- Tools ---

server.registerTool(
  "search_products",
  {
    description:
      "Search for products in the Rami Levy catalog. Query can be in Hebrew or English. Returns product name, price, brand, size, and ID.",
    inputSchema: {
      query: z.string().describe("Search query (e.g., 'חלב', 'eggs', 'קוטג')"),
      store: z.string().optional().describe("Store ID (default: from config)"),
    },
  },
  async ({ query, store }) => {
    const result = await searchProducts(query, store);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Rami Levy MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 3: Verify it compiles**

Run: `npm run build`
Expected: Clean compilation

**Step 4: Commit**

```bash
git add src/api/search.ts src/server.ts
git commit -m "feat: add search_products tool"
```

---

### Task 4: Cart Operations

**Files:**
- Create: `src/api/cart.ts`
- Modify: `src/server.ts`

**Step 1: Create src/api/cart.ts**

```typescript
import { ramiLevyFetch, getStore } from "./client.js";
import { CartResponseSchema, type CartResponse, type CartItemInput } from "../types.js";

const CART_URL = "https://www.rami-levy.co.il/api/v2/cart";

function buildCartPayload(
  store: string,
  items: Record<string, string>,
): object {
  return {
    store,
    isClub: 0,
    supplyAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    items,
    meta: null,
  };
}

export async function getCart(): Promise<CartResponse> {
  const response = await ramiLevyFetch(CART_URL);
  return CartResponseSchema.parse(response);
}

export async function addToCart(
  store: string,
  newItems: CartItemInput[],
): Promise<CartResponse> {
  // Get current cart to merge
  let currentItems: Record<string, string> = {};
  try {
    const current = await getCart();
    for (const item of current.items) {
      if (!item.is_delivery) {
        currentItems[item.id.toString()] = item.quantity.toString();
      }
    }
  } catch {
    // Empty cart or error - start fresh
  }

  // Merge new items (add to existing quantity or create new)
  for (const item of newItems) {
    const existingQty = parseFloat(currentItems[item.id.toString()] || "0");
    currentItems[item.id.toString()] = (existingQty + item.quantity).toString();
  }

  const payload = buildCartPayload(store, currentItems);
  const response = await ramiLevyFetch(CART_URL, {
    method: "POST",
    body: payload,
  });

  return CartResponseSchema.parse(response);
}

export async function removeFromCart(
  store: string,
  itemIds: number[],
): Promise<CartResponse> {
  const current = await getCart();
  const idsToRemove = new Set(itemIds);

  // Keep everything except the removed items (and delivery fee)
  const remainingItems: Record<string, string> = {};
  for (const item of current.items) {
    if (!item.is_delivery && !idsToRemove.has(item.id)) {
      remainingItems[item.id.toString()] = item.quantity.toString();
    }
  }

  const payload = buildCartPayload(store, remainingItems);
  const response = await ramiLevyFetch(CART_URL, {
    method: "POST",
    body: payload,
  });

  return CartResponseSchema.parse(response);
}
```

**Step 2: Register cart tools in src/server.ts**

Add these imports at the top of `src/server.ts`:

```typescript
import { addToCart, removeFromCart, getCart } from "./api/cart.js";
import { getStore } from "./api/client.js";
```

Add these tool registrations before the `// --- Start ---` section:

```typescript
server.registerTool(
  "add_to_cart",
  {
    description:
      "Add products to the Rami Levy shopping cart. Merges with existing cart contents. Each item needs a product ID (from search_products) and quantity.",
    inputSchema: {
      store: z.string().optional().describe("Store ID (default: from config)"),
      items: z
        .array(
          z.object({
            id: z.number().describe("Product ID from search results"),
            quantity: z.number().min(1).describe("Quantity to add"),
          }),
        )
        .describe("Items to add to cart"),
    },
  },
  async ({ store, items }) => {
    const result = await addToCart(store || getStore(), items);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "remove_from_cart",
  {
    description:
      "Remove products from the Rami Levy shopping cart by their product IDs.",
    inputSchema: {
      store: z.string().optional().describe("Store ID (default: from config)"),
      item_ids: z
        .array(z.number())
        .describe("Product IDs to remove from cart"),
    },
  },
  async ({ store, item_ids }) => {
    const result = await removeFromCart(store || getStore(), item_ids);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "get_cart",
  {
    description:
      "Get the current contents of the Rami Levy shopping cart, including items, prices, and totals.",
  },
  async () => {
    const result = await getCart();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "get_checkout_link",
  {
    description:
      "Get the URL to complete the purchase on the Rami Levy website. The user must open this link in a browser to pay.",
  },
  async () => {
    return {
      content: [
        {
          type: "text" as const,
          text: "https://www.rami-levy.co.il/he/dashboard/checkout",
        },
      ],
    };
  },
);
```

**Step 3: Verify it compiles**

Run: `npm run build`
Expected: Clean compilation

**Step 4: Commit**

```bash
git add src/api/cart.ts src/server.ts
git commit -m "feat: add cart tools (add, remove, get, checkout)"
```

---

### Task 5: Auth Setup Script

**Files:**
- Create: `scripts/setup-auth.ts`

**Step 1: Create scripts/setup-auth.ts**

```typescript
#!/usr/bin/env node
import * as readline from "readline";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";

const ENV_PATH = resolve(import.meta.dirname, "..", ".env");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║         Rami Levy MCP Server - Auth Setup               ║
╚══════════════════════════════════════════════════════════╝

This script helps you extract authentication tokens from
the Rami Levy website.

Steps:
1. Opening https://www.rami-levy.co.il in your browser...
2. Log in to your Rami Levy account
3. Open DevTools (F12) → Network tab
4. Perform any action (e.g., search for a product)
5. Click on any request to rami-levy.co.il
6. Copy the header values when prompted below
`);

  // Try to open browser
  try {
    const open = (await import("open")).default;
    await open("https://www.rami-levy.co.il");
    console.log("Browser opened. Log in and open DevTools (F12) → Network tab.\n");
  } catch {
    console.log("Could not open browser automatically.");
    console.log("Please open https://www.rami-levy.co.il manually.\n");
  }

  console.log('Find any API request in the Network tab and copy these headers:\n');

  const token = await ask(
    'Authorization header value (the part after "Bearer "): ',
  );
  const ecomToken = await ask("ecomtoken header value: ");
  const cookie = await ask("cookie header value: ");

  // Load existing .env to preserve store setting
  let existingStore = "331";
  if (existsSync(ENV_PATH)) {
    const existing = readFileSync(ENV_PATH, "utf-8");
    const match = existing.match(/^RAMI_LEVY_STORE=(.+)$/m);
    if (match) existingStore = match[1];
  }

  const storeInput = await ask(
    `Store ID (press Enter for ${existingStore}): `,
  );
  const store = storeInput || existingStore;

  const envContent = `RAMI_LEVY_AUTH_TOKEN=${token}
RAMI_LEVY_ECOM_TOKEN=${ecomToken}
RAMI_LEVY_COOKIE=${cookie}
RAMI_LEVY_STORE=${store}
`;

  writeFileSync(ENV_PATH, envContent);
  console.log(`\nTokens saved to ${ENV_PATH}`);
  console.log("You can now use the MCP server. Tokens will expire periodically -");
  console.log("run this script again when they do.\n");

  rl.close();
}

main().catch((error) => {
  console.error("Error:", error.message);
  rl.close();
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: Clean compilation, `dist/scripts/setup-auth.js` created

**Step 3: Commit**

```bash
git add scripts/setup-auth.ts
git commit -m "feat: add interactive auth setup script"
```

---

### Task 6: Error Handling & Final Server Polish

**Files:**
- Modify: `src/server.ts` (wrap tool handlers with error handling)

**Step 1: Add error formatting to src/api/client.ts**

Add at the bottom of `src/api/client.ts`:

```typescript
export function formatError(error: unknown): string {
  if (error instanceof RamiLevyApiError) {
    if (error.status === 401 || error.status === 403) {
      return "Auth tokens expired or invalid. Run 'npm run setup-auth' to refresh your tokens.";
    }
    return `Rami Levy API error (${error.status}): ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
```

**Step 2: Wrap each tool handler in try/catch in src/server.ts**

Update each tool callback to catch errors and return them as tool results instead of throwing. For example, the search tool becomes:

```typescript
server.registerTool(
  "search_products",
  {
    description:
      "Search for products in the Rami Levy catalog. Query can be in Hebrew or English. Returns product name, price, brand, size, and ID.",
    inputSchema: {
      query: z.string().describe("Search query (e.g., 'חלב', 'eggs', 'קוטג')"),
      store: z.string().optional().describe("Store ID (default: from config)"),
    },
  },
  async ({ query, store }) => {
    try {
      const result = await searchProducts(query, store);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatError(error) }],
        isError: true,
      };
    }
  },
);
```

Apply the same try/catch + `isError: true` pattern to all other tool handlers (`add_to_cart`, `remove_from_cart`, `get_cart`).

**Step 3: Import formatError in server.ts**

Update the client import:

```typescript
import { getStore, formatError } from "./api/client.js";
```

**Step 4: Verify it compiles**

Run: `npm run build`
Expected: Clean compilation

**Step 5: Commit**

```bash
git add src/server.ts src/api/client.ts
git commit -m "feat: add error handling with clear auth expiry messages"
```

---

### Task 7: Manual Integration Test

**Files:** None (testing only)

**Step 1: Build the project**

Run: `npm run build`
Expected: Clean compilation

**Step 2: Run setup-auth**

Run: `npm run setup-auth`
Expected: Opens browser, prompts for tokens, writes `.env`

**Step 3: Test with MCP Inspector or Claude Code**

Option A - Quick smoke test with node:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/server.js
```

Expected: JSON response with server capabilities including the 5 tools.

Option B - Configure in Claude Code's MCP settings and test conversationally:

Add to `~/.claude/settings.json` or project MCP config:
```json
{
  "mcpServers": {
    "rami-levy": {
      "command": "node",
      "args": ["/mnt/c/projects/shopping/dist/server.js"]
    }
  }
}
```

Then test: "Search for cottage cheese on Rami Levy" → should call search_products.

**Step 4: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: adjustments from integration testing"
```
