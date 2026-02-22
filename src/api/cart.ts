import { execSync } from "child_process";
import { ramiLevyFetch } from "./client.js";
import { CartResponseSchema, type CartResponse, type CartItemInput } from "../types.js";

const CART_URL = "https://www.rami-levy.co.il/api/v2/cart";

/**
 * Sync the browser's localStorage cart cache via Chrome DevTools Protocol.
 * Requires Chrome launched with --remote-debugging-port=9222.
 * Silently fails if Chrome CDP is not available.
 */
async function syncBrowser(): Promise<void> {
  try {
    // Use PowerShell on the Windows side to talk to Chrome CDP (avoids WSL2 networking issues)
    const js = 'var d=JSON.parse(localStorage.ramilevy);d.cart={items:[],loaded:false};localStorage.ramilevy=JSON.stringify(d);location.reload();';
    const psScript = `
$pages = (Invoke-WebRequest -Uri 'http://localhost:9222/json' -UseBasicParsing -TimeoutSec 2).Content | ConvertFrom-Json
$rlPage = $pages | Where-Object { $_.url -like '*rami-levy*' } | Select-Object -First 1
if ($rlPage) {
  $wsUrl = $rlPage.webSocketDebuggerUrl
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ct = New-Object System.Threading.CancellationToken
  $ws.ConnectAsync([Uri]$wsUrl, $ct).Wait()
  $msg = '{"id":1,"method":"Runtime.evaluate","params":{"expression":"${js}"}}'
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
  $segment = New-Object System.ArraySegment[byte] -ArgumentList (,$bytes)
  $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
  Start-Sleep -Milliseconds 500
  $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait()
}`;
    execSync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      { encoding: "utf-8", timeout: 10000, stdio: "pipe" },
    );
    console.error("Browser cart cache synced via CDP");
  } catch {
    console.error("Browser sync skipped (Chrome CDP not available)");
  }
}

// In-memory cache of cart items. The Rami Levy API has no GET endpoint for
// the cart — every POST writes the FULL cart and returns the new state.
// We cache items from each response so we can merge on subsequent calls.
let cachedItems: Record<string, string> = {};
let cacheValid = false;

function formatQty(n: number): string {
  return n.toFixed(2);
}

function updateCache(cart: CartResponse): void {
  cachedItems = {};
  for (const item of cart.items) {
    cachedItems[item.id.toString()] = formatQty(item.quantity);
  }
  cacheValid = true;
}

function buildCartPayload(
  store: string,
  items: Record<string, string>,
): object {
  return {
    store,
    isClub: 0,
    supplyAt: (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString();
    })(),
    items,
    meta: null,
  };
}

export async function getCart(store: string): Promise<CartResponse> {
  // POST the cached items to get current prices/totals without changing items.
  // If no cache exists, POST empty items which acts as a "read" (returns empty cart
  // if cart was empty, or syncs to server state).
  const payload = buildCartPayload(store, cacheValid ? cachedItems : {});
  const response = await ramiLevyFetch(CART_URL, { method: "POST", body: payload });
  const cart = CartResponseSchema.parse(response);
  updateCache(cart);
  return cart;
}

export async function addToCart(
  store: string,
  newItems: CartItemInput[],
): Promise<CartResponse> {
  // If we don't have cache, start fresh (items added on website won't be preserved)
  const currentItems: Record<string, string> = cacheValid
    ? { ...cachedItems }
    : {};

  for (const item of newItems) {
    const existingQty = parseFloat(currentItems[item.id.toString()] || "0");
    currentItems[item.id.toString()] = formatQty(existingQty + item.quantity);
  }

  const payload = buildCartPayload(store, currentItems);
  const response = await ramiLevyFetch(CART_URL, { method: "POST", body: payload });

  const cart = CartResponseSchema.parse(response);
  updateCache(cart);
  await syncBrowser();
  return cart;
}

export async function removeFromCart(
  store: string,
  itemIds: number[],
): Promise<CartResponse> {
  if (!cacheValid) {
    throw new Error(
      "Cart state unknown — cannot remove items without first syncing. " +
      "Use get_cart first to sync the cart state.",
    );
  }

  const idsToRemove = new Set(itemIds.map(String));
  const updatedItems: Record<string, string> = {};
  for (const [id, qty] of Object.entries(cachedItems)) {
    if (!idsToRemove.has(id)) {
      updatedItems[id] = qty;
    }
  }

  const payload = buildCartPayload(store, updatedItems);
  const response = await ramiLevyFetch(CART_URL, { method: "POST", body: payload });

  const cart = CartResponseSchema.parse(response);
  updateCache(cart);
  await syncBrowser();
  return cart;
}
