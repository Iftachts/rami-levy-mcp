import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Credentials } from "./api/client.js";

// ---------------------------------------------------------------------------
// Client store — keeps track of dynamically-registered OAuth clients
// ---------------------------------------------------------------------------

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string) {
    return this.clients.get(clientId);
  }

  async registerClient(metadata: OAuthClientInformationFull) {
    this.clients.set(metadata.client_id, metadata);
    return metadata;
  }
}

// ---------------------------------------------------------------------------
// Pending authorisation request (lives between /authorize → /login POST)
// ---------------------------------------------------------------------------

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  credentials?: Credentials;
}

// ---------------------------------------------------------------------------
// Stored access-token entry
// ---------------------------------------------------------------------------

interface StoredToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  credentials: Credentials;
}

// ---------------------------------------------------------------------------
// OAuth provider — issues tokens that carry Rami Levy credentials
// ---------------------------------------------------------------------------

export class RamiLevyAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new InMemoryClientsStore();

  /** request-id → pending (waiting for the user to submit the login form) */
  private pendingAuths = new Map<string, PendingAuth>();
  /** auth-code → pending (credentials filled in, waiting for token exchange) */
  private codes = new Map<string, PendingAuth>();
  /** access-token string → stored token data */
  private tokens = new Map<string, StoredToken>();

  // ------ OAuth interface methods ------

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const requestId = randomUUID();
    this.pendingAuths.set(requestId, { client, params });
    res.redirect(`/login?request_id=${requestId}`);
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const data = this.codes.get(authorizationCode);
    if (!data) throw new Error("Invalid authorization code");
    return data.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const data = this.codes.get(authorizationCode);
    if (!data) throw new Error("Invalid authorization code");
    if (data.client.client_id !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }

    this.codes.delete(authorizationCode);

    const token = randomUUID();
    const expiresIn = 24 * 60 * 60; // 24 hours

    this.tokens.set(token, {
      clientId: client.client_id,
      scopes: data.params.scopes || [],
      expiresAt: Date.now() + expiresIn * 1000,
      credentials: data.credentials!,
    });

    return {
      access_token: token,
      token_type: "bearer",
      expires_in: expiresIn,
      scope: (data.params.scopes || []).join(" "),
    };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new Error("Refresh tokens are not supported");
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const data = this.tokens.get(token);
    if (!data) throw new Error("Invalid or expired token");
    if (data.expiresAt < Date.now()) {
      this.tokens.delete(token);
      throw new Error("Token has expired");
    }

    return {
      token,
      clientId: data.clientId,
      scopes: data.scopes,
      expiresAt: Math.floor(data.expiresAt / 1000),
      extra: {
        authToken: data.credentials.authToken,
        ecomToken: data.credentials.ecomToken,
        cookie: data.credentials.cookie,
        store: data.credentials.store,
      },
    };
  }

  // ------ Helpers used by the /login route ------

  /** Returns the redirect info for a pending authorisation request. */
  getAuthRequest(requestId: string) {
    const pending = this.pendingAuths.get(requestId);
    if (!pending) return null;
    return {
      redirectUri: pending.params.redirectUri,
      state: pending.params.state,
    };
  }

  /**
   * Completes a pending authorisation by attaching the user's credentials.
   * Returns the authorization code, or null if the request-id is unknown.
   */
  completeAuthorization(
    requestId: string,
    credentials: Credentials,
  ): string | null {
    const pending = this.pendingAuths.get(requestId);
    if (!pending) return null;

    this.pendingAuths.delete(requestId);

    const code = randomUUID();
    this.codes.set(code, { ...pending, credentials });
    return code;
  }
}

// ---------------------------------------------------------------------------
// Login page HTML — served at GET /login
// ---------------------------------------------------------------------------

export function loginPageHtml(requestId: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rami Levy MCP — Login</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; max-width: 560px; margin: 40px auto; padding: 20px; background: #f5f5f5; }
  h1 { color: #1a73e8; text-align: center; }
  .card { background: white; border-radius: 8px; padding: 24px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  label { display: block; font-weight: bold; margin: 12px 0 4px; }
  input, textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; font-family: monospace; }
  textarea { height: 80px; resize: vertical; }
  .btn { display: block; width: 100%; background: #1a73e8; color: white; border: none; padding: 14px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; margin-top: 16px; }
  .btn:hover { background: #1557b0; }
  .or { text-align: center; color: #888; margin: 20px 0; font-size: 14px; }
  .note { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin: 12px 0; font-size: 13px; }
  .tabs { display: flex; gap: 0; margin-bottom: 0; }
  .tab { flex: 1; padding: 12px; text-align: center; cursor: pointer; border: 1px solid #ccc; background: #f0f0f0; font-weight: bold; }
  .tab:first-child { border-radius: 8px 8px 0 0; }
  .tab:last-child { border-radius: 8px 8px 0 0; }
  .tab.active { background: white; border-bottom: none; }
  .tab-content { display: none; }
  .tab-content.active { display: block; }
  .error { color: red; text-align: center; margin: 12px 0; }
</style>
</head>
<body>
<h1>Rami Levy MCP</h1>
<p style="text-align:center;color:#555;">הזינו את הטוקנים שלכם כדי להתחבר לשרת MCP</p>

<div class="card" style="border-radius: 0 0 8px 8px;">
  <div class="tabs">
    <div class="tab active" onclick="switchTab('bookmarklet')">Bookmarklet (מהיר)</div>
    <div class="tab" onclick="switchTab('manual')">ידני</div>
  </div>

  <form id="loginForm" method="POST" action="/login">
    <input type="hidden" name="request_id" value="${requestId}" />

    <div id="tab-bookmarklet" class="tab-content active">
      <div class="note">
        השתמשו ב-bookmarklet באתר רמי לוי כדי לחלץ את הטוקנים, ואז הדביקו כאן את הקוד שקיבלתם.
      </div>
      <label for="encoded">קוד מקודד (base64):</label>
      <textarea id="encoded" name="encoded" placeholder="הדביקו כאן את הקוד מה-bookmarklet..."></textarea>
    </div>

    <div id="tab-manual" class="tab-content">
      <label for="authToken">Auth Token:</label>
      <input id="authToken" name="authToken" type="text" placeholder="Bearer token from Rami Levy" />

      <label for="ecomToken">Ecom Token:</label>
      <input id="ecomToken" name="ecomToken" type="text" placeholder="Ecom token" />

      <label for="cookie">Cookie (אופציונלי):</label>
      <input id="cookie" name="cookie" type="text" placeholder="Session cookie" />

      <label for="store">חנות (אופציונלי):</label>
      <input id="store" name="store" type="text" placeholder="331" value="331" />
    </div>

    <div id="formError" class="error" style="display:none;"></div>

    <button type="submit" class="btn">התחבר</button>
  </form>
</div>

<script>
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector('[onclick*="' + tab + '"]').classList.add('active');
}

document.getElementById('loginForm').addEventListener('submit', function(e) {
  var encoded = document.getElementById('encoded').value.trim();
  var authToken = document.getElementById('authToken').value.trim();
  var ecomToken = document.getElementById('ecomToken').value.trim();

  // If bookmarklet tab is active and has data, decode it into hidden fields
  if (encoded) {
    try {
      var data = JSON.parse(atob(encoded));
      document.getElementById('authToken').value = data.a || '';
      document.getElementById('ecomToken').value = data.e || data.a || '';
      document.getElementById('cookie').value = data.c || '';
    } catch(err) {
      e.preventDefault();
      document.getElementById('formError').style.display = 'block';
      document.getElementById('formError').textContent = 'קוד לא תקין. וודאו שהעתקתם את כל הקוד מה-bookmarklet.';
      return;
    }
  }

  if (!document.getElementById('authToken').value || !document.getElementById('ecomToken').value) {
    e.preventDefault();
    document.getElementById('formError').style.display = 'block';
    document.getElementById('formError').textContent = 'חובה למלא Auth Token ו-Ecom Token.';
  }
});
</script>
</body>
</html>`;
}
