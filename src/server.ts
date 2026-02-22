#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchProducts } from "./api/search.js";
import { addToCart, removeFromCart, getCart } from "./api/cart.js";
import { getStore, formatError } from "./api/client.js";

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
    try {
      const result = await searchProducts(query, store);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatError(error) }],
        isError: true,
      };
    }
  },
);

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
    try {
      const result = await addToCart(store || getStore(), items);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatError(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "remove_from_cart",
  {
    description:
      "Remove products from the Rami Levy shopping cart by their product IDs. " +
      "IMPORTANT: After removal, the user MUST run the browser sync script (from get_browser_sync_script) " +
      "in their browser console, or open the cart in a fresh incognito tab. " +
      "The Rami Levy website caches cart state locally and will re-add removed items on page refresh otherwise.",
    inputSchema: {
      store: z.string().optional().describe("Store ID (default: from config)"),
      item_ids: z
        .array(z.number())
        .describe("Product IDs to remove from cart"),
    },
  },
  async ({ store, item_ids }) => {
    try {
      const result = await removeFromCart(store || getStore(), item_ids);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
          {
            type: "text" as const,
            text: "\n⚠️ BROWSER SYNC REQUIRED: The Rami Levy website caches cart state locally. " +
              "To see the removal on the website, run this in the browser console (F12):\n" +
              "var d = JSON.parse(localStorage.ramilevy); d.cart = {items:[],loaded:false}; localStorage.ramilevy = JSON.stringify(d); location.reload();",
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatError(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "get_cart",
  {
    description:
      "Get the current contents of the Rami Levy shopping cart, including items, prices, and totals.",
    inputSchema: {
      store: z.string().optional().describe("Store ID (default: from config)"),
    },
  },
  async ({ store }) => {
    try {
      const result = await getCart(store || getStore());
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatError(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "get_browser_sync_script",
  {
    description:
      "Get a JavaScript snippet to run in the browser console after cart modifications (add/remove). " +
      "The Rami Levy website caches cart state in the browser. After making changes via the API, " +
      "the user must run this script in their browser console (F12 → Console) to sync the browser with the server state.",
  },
  async () => {
    const script = `// Paste this in your browser console on the Rami Levy website (F12 → Console)
// This clears ONLY the cached cart state and reloads from the server
var d = JSON.parse(localStorage.ramilevy); d.cart = {items:[],loaded:false}; localStorage.ramilevy = JSON.stringify(d); location.reload();`;
    return {
      content: [
        {
          type: "text" as const,
          text: script,
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
