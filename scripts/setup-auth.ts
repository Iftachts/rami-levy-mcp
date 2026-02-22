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
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551         Rami Levy MCP Server - Auth Setup               \u2551
\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d

This script helps you extract authentication tokens from
the Rami Levy website.

Steps:
1. Opening https://www.rami-levy.co.il in your browser...
2. Log in to your Rami Levy account
3. Open DevTools (F12) \u2192 Network tab
4. Perform any action (e.g., search for a product)
5. Click on any request to rami-levy.co.il
6. Copy the header values when prompted below
`);

  // Try to open browser
  try {
    const open = (await import("open")).default;
    await open("https://www.rami-levy.co.il");
    console.log("Browser opened. Log in and open DevTools (F12) \u2192 Network tab.\n");
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
