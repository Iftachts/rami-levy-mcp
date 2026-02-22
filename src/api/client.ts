import "dotenv/config";
import { execSync } from "child_process";

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
  const headers: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json;charset=UTF-8",
    authorization: `Bearer ${getRequiredEnv("RAMI_LEVY_AUTH_TOKEN")}`,
    ecomtoken: getRequiredEnv("RAMI_LEVY_ECOM_TOKEN"),
    locale: "he",
    origin: "https://www.rami-levy.co.il",
    referer: "https://www.rami-levy.co.il/he",
    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  };
  const cookie = process.env.RAMI_LEVY_COOKIE;
  if (cookie) {
    headers.cookie = cookie;
  }
  return headers;
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

export async function ramiLevyCurl(
  url: string,
  body: unknown,
): Promise<unknown> {
  const authToken = getRequiredEnv("RAMI_LEVY_AUTH_TOKEN");
  const ecomToken = getRequiredEnv("RAMI_LEVY_ECOM_TOKEN");
  const cookie = process.env.RAMI_LEVY_COOKIE || "";

  const jsonBody = JSON.stringify(body);
  // Escape single quotes in JSON for shell safety
  const escapedBody = jsonBody.replace(/'/g, "'\\''");

  const cmd = [
    "curl", "-s",
    `'${url}'`,
    "-H", "'accept: application/json, text/plain, */*'",
    "-H", "'accept-language: en-US,en;q=0.9'",
    "-H", `'authorization: Bearer ${authToken}'`,
    "-H", "'content-type: application/json;charset=UTF-8'",
    "-b", `'${cookie}'`,
    "-H", `'ecomtoken: ${ecomToken}'`,
    "-H", "'locale: he'",
    "-H", "'origin: https://www.rami-levy.co.il'",
    "-H", "'priority: u=1, i'",
    "-H", "'referer: https://www.rami-levy.co.il/he'",
    "-H", `'sec-ch-ua: "Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"'`,
    "-H", "'sec-ch-ua-mobile: ?0'",
    "-H", `'sec-ch-ua-platform: "Windows"'`,
    "-H", "'sec-fetch-dest: empty'",
    "-H", "'sec-fetch-mode: cors'",
    "-H", "'sec-fetch-site: same-origin'",
    "-H", "'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'",
    "--data-raw", `'${escapedBody}'`,
  ].join(" ");

  const result = execSync(cmd, { encoding: "utf-8", maxBuffer: 1024 * 1024 });

  const parsed = JSON.parse(result);

  if (parsed.status === 401 || parsed.status === 403) {
    throw new RamiLevyApiError(
      "Auth tokens expired or invalid. Run 'npm run setup-auth' to refresh.",
      parsed.status,
    );
  }

  return parsed;
}

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
