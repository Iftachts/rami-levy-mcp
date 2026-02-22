#!/usr/bin/env node
import * as readline from "readline";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";

const ENV_PATH = resolve(import.meta.dirname, "..", ".env");
const HTML_PATH = resolve(import.meta.dirname, "extract-tokens.html");

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
1. Log in to https://www.rami-levy.co.il
2. Open the token extractor page in your browser
3. Follow the instructions to capture your tokens
4. Paste the captured code below
`);

  // Try to open the HTML helper
  try {
    const open = (await import("open")).default;
    await open(HTML_PATH);
    console.log("Token extractor page opened in your browser.\n");
    console.log("Follow the steps on that page, then paste the captured code below.\n");
  } catch {
    console.log(`Could not open browser automatically.`);
    console.log(`Please open this file in your browser: ${HTML_PATH}\n`);
  }

  const encoded = await ask("Paste the captured code here: ");

  let token: string;
  let ecomToken: string;
  let cookie: string;

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
    token = decoded.a || "";
    ecomToken = decoded.e || "";
    cookie = decoded.c || "";

    if (!token) {
      throw new Error("Auth token not found in captured data");
    }

    console.log("\nTokens decoded successfully!");
  } catch (e) {
    console.error("\nFailed to decode the captured code. Make sure you copied the full output.");
    console.error("You can also set up tokens manually — see README.md for details.\n");
    rl.close();
    process.exit(1);
  }

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
