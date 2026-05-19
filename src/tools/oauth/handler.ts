// =============================================================================
// OAuth 2.0 Handler — Phase 4 of the Setup Execution Agent roadmap
//
// Flow:
//   1. Start a temporary HTTP server on :3457/oauth/callback
//   2. Build the provider's consent URL with PKCE (Google) or standard code flow
//   3. Launch a headed Playwright browser to the consent URL
//   4. User clicks "Allow" — provider redirects to localhost:3457/oauth/callback?code=...
//   5. Handler exchanges the code for access_token + refresh_token
//   6. Return the tokens; caller saves via save_integration_credentials
//
// Providers: google | slack | microsoft | github
//
// Security:
//   • Callback server only listens on 127.0.0.1 (never 0.0.0.0)
//   • State parameter prevents CSRF on the OAuth callback
//   • PKCE (S256) used for Google and Microsoft — no client_secret required
//   • Server shuts down immediately after one successful callback
//   • 5-minute timeout — server closes and rejects if no callback arrives
// =============================================================================

import http      from "http";
import crypto    from "crypto";
import { z }     from "zod";
import { buildTool } from "../registry.js";

const CALLBACK_PORT = parseInt(process.env.OAUTH_CALLBACK_PORT || "3457", 10);
const REDIRECT_URI  = `http://localhost:${CALLBACK_PORT}/oauth/callback`;
const FLOW_TIMEOUT  = 5 * 60 * 1000; // 5 minutes

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ── Callback server ───────────────────────────────────────────────────────────

interface CallbackResult { code: string; state: string }

function waitForCallback(expectedState: string): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url    = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== "/oauth/callback") return;

      const code  = url.searchParams.get("code");
      const state = url.searchParams.get("state") ?? "";
      const error = url.searchParams.get("error");

      const html = (title: string, body: string) =>
        `<!DOCTYPE html><html><head><title>${title}</title>
        <style>body{font-family:system-ui;text-align:center;padding:80px 24px;background:#0d1117;color:#f0f6fc}
        h2{margin-bottom:12px}p{color:#8b949e}</style></head>
        <body><h2>${title}</h2><p>${body}</p></body></html>`;

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(html("❌ Authorization Failed", `Error: ${error}. You can close this tab.`));
        server.close();
        reject(new Error(`OAuth error from provider: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(html("❌ No code received", "The authorization code is missing. Please try again."));
        server.close();
        reject(new Error("OAuth callback received no authorization code"));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(html("❌ State mismatch", "Possible CSRF attack. Request rejected."));
        server.close();
        reject(new Error("OAuth state mismatch — possible CSRF"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html("✅ Authorization Successful", "You can close this tab — your app is now connected!"));
      server.close();
      resolve({ code, state });
    });

    server.listen(CALLBACK_PORT, "127.0.0.1");

    // 5-minute hard timeout
    setTimeout(() => {
      server.close();
      reject(new Error(`OAuth flow timed out after 5 minutes. Make sure you clicked "Allow" in the browser.`));
    }, FLOW_TIMEOUT).unref();
  });
}

// ── Provider configurations ───────────────────────────────────────────────────

interface ProviderConfig {
  authUrl:   string;
  tokenUrl:  string;
  usePKCE:   boolean;
  buildAuthUrl: (params: {
    clientId: string;
    scopes: string[];
    state: string;
    codeChallenge?: string;
    redirectUri: string;
    extra?: Record<string, string>;
  }) => string;
  exchangeToken: (params: {
    code: string;
    clientId: string;
    clientSecret?: string;
    codeVerifier?: string;
    redirectUri: string;
  }) => Promise<OAuthTokens>;
}

interface OAuthTokens {
  accessToken:  string;
  refreshToken?: string;
  expiresIn?:   number;
  scope?:       string;
  tokenType?:   string;
}

async function fetchTokens(
  tokenUrl: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<any> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body:    new URLSearchParams(body).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

const PROVIDERS: Record<string, ProviderConfig> = {

  // ── Google ──────────────────────────────────────────────────────────────────
  google: {
    authUrl:  "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    usePKCE:  true,
    buildAuthUrl({ clientId, scopes, state, codeChallenge, redirectUri }) {
      const p = new URLSearchParams({
        client_id:             clientId,
        redirect_uri:          redirectUri,
        response_type:         "code",
        scope:                 scopes.join(" "),
        state,
        access_type:           "offline",
        prompt:                "consent",
        code_challenge:        codeChallenge!,
        code_challenge_method: "S256",
      });
      return `${this.authUrl}?${p.toString()}`;
    },
    async exchangeToken({ code, clientId, clientSecret, codeVerifier, redirectUri }) {
      const body: Record<string, string> = {
        code, client_id: clientId, redirect_uri: redirectUri,
        grant_type: "authorization_code", code_verifier: codeVerifier!,
      };
      if (clientSecret) body.client_secret = clientSecret;
      const json = await fetchTokens(this.tokenUrl, body);
      return {
        accessToken:  json.access_token,
        refreshToken: json.refresh_token,
        expiresIn:    json.expires_in,
        scope:        json.scope,
        tokenType:    json.token_type,
      };
    },
  },

  // ── Slack ───────────────────────────────────────────────────────────────────
  slack: {
    authUrl:  "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    usePKCE:  false,
    buildAuthUrl({ clientId, scopes, state, redirectUri }) {
      const p = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri,
        scope: scopes.join(","), state,
      });
      return `${this.authUrl}?${p.toString()}`;
    },
    async exchangeToken({ code, clientId, clientSecret, redirectUri }) {
      const json = await fetchTokens(
        this.tokenUrl,
        { code, client_id: clientId, client_secret: clientSecret ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" },
      );
      if (!json.ok) throw new Error(`Slack token exchange failed: ${json.error}`);
      return {
        accessToken:  json.access_token,
        refreshToken: json.refresh_token,
        tokenType:    json.token_type,
        scope:        json.scope,
      };
    },
  },

  // ── Microsoft ────────────────────────────────────────────────────────────────
  microsoft: {
    authUrl:  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    usePKCE:  true,
    buildAuthUrl({ clientId, scopes, state, codeChallenge, redirectUri }) {
      const p = new URLSearchParams({
        client_id:             clientId,
        redirect_uri:          redirectUri,
        response_type:         "code",
        scope:                 scopes.join(" "),
        state,
        code_challenge:        codeChallenge!,
        code_challenge_method: "S256",
        response_mode:         "query",
      });
      return `${this.authUrl}?${p.toString()}`;
    },
    async exchangeToken({ code, clientId, clientSecret, codeVerifier, redirectUri }) {
      const body: Record<string, string> = {
        code, client_id: clientId, redirect_uri: redirectUri,
        grant_type: "authorization_code", code_verifier: codeVerifier!,
      };
      if (clientSecret) body.client_secret = clientSecret;
      const json = await fetchTokens(this.tokenUrl, body);
      return {
        accessToken:  json.access_token,
        refreshToken: json.refresh_token,
        expiresIn:    json.expires_in,
        scope:        json.scope,
        tokenType:    json.token_type,
      };
    },
  },

  // ── GitHub ───────────────────────────────────────────────────────────────────
  github: {
    authUrl:  "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    usePKCE:  false,
    buildAuthUrl({ clientId, scopes, state, redirectUri }) {
      const p = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri,
        scope: scopes.join(" "), state,
      });
      return `${this.authUrl}?${p.toString()}`;
    },
    async exchangeToken({ code, clientId, clientSecret, redirectUri }) {
      const json = await fetchTokens(
        this.tokenUrl,
        { code, client_id: clientId, client_secret: clientSecret ?? "", redirect_uri: redirectUri },
        { Accept: "application/json" },
      );
      if (json.error) throw new Error(`GitHub token exchange failed: ${json.error_description ?? json.error}`);
      return { accessToken: json.access_token, scope: json.scope, tokenType: json.token_type };
    },
  },
};

// ── Tool definition ───────────────────────────────────────────────────────────

export const oauthFlowTool = buildTool({
  name: "oauth_flow",
  description:
    "Complete a full OAuth 2.0 authorization flow in a headed browser. " +
    "Opens the provider's consent page, waits for the user to click Allow, " +
    "captures the authorization code, exchanges it for tokens, and returns them. " +
    "Supported providers: google | slack | microsoft | github. " +
    "IMPORTANT: This opens a visible browser window — the user must click Allow themselves. " +
    "After completing, save the returned tokens via save_integration_credentials.",
  category: "browser" as any,
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    provider:     z.enum(["google", "slack", "microsoft", "github"]).describe("OAuth provider"),
    clientId:     z.string().describe("OAuth App Client ID"),
    clientSecret: z.string().optional().describe("OAuth App Client Secret (required for Slack/GitHub; optional for Google/Microsoft with PKCE)"),
    scopes:       z.array(z.string()).describe(
      "OAuth scopes to request. Examples:\n" +
      "  google: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/calendar']\n" +
      "  slack: ['channels:read', 'chat:write', 'channels:history']\n" +
      "  microsoft: ['Mail.Read', 'Mail.Send', 'Calendars.ReadWrite', 'offline_access']\n" +
      "  github: ['repo', 'user']",
    ),
    extraParams: z.record(z.string()).optional().describe("Extra URL parameters to add to the auth URL"),
  }),

  async call(input): Promise<any> {
    const providerCfg = PROVIDERS[input.provider];
    if (!providerCfg) {
      return { success: false, error: `Unknown provider "${input.provider}". Supported: ${Object.keys(PROVIDERS).join(", ")}` };
    }

    // Generate PKCE if the provider supports it
    const codeVerifier  = providerCfg.usePKCE ? generateCodeVerifier() : undefined;
    const codeChallenge = codeVerifier ? generateCodeChallenge(codeVerifier) : undefined;
    const state         = crypto.randomBytes(16).toString("hex");

    // Build the consent URL
    const authUrl = providerCfg.buildAuthUrl({
      clientId:     input.clientId,
      scopes:       input.scopes,
      state,
      codeChallenge,
      redirectUri:  REDIRECT_URI,
      extra:        input.extraParams,
    });

    // Launch a headed Playwright browser
    let playwright: any;
    try {
      playwright = await import("playwright");
    } catch {
      return {
        success: false,
        error: "Playwright is not installed. Run: npm install playwright && npx playwright install chromium",
      };
    }

    let browser: any;
    try {
      browser = await playwright.chromium.launch({ headless: false }); // must be headed for OAuth
      const ctx  = await browser.newContext();
      const page = await ctx.newPage();

      // Start waiting for the callback BEFORE navigating (avoids race condition)
      const callbackPromise = waitForCallback(state);
      await page.goto(authUrl, { waitUntil: "domcontentloaded" });

      // Wait for user to complete the OAuth flow
      const { code } = await callbackPromise;

      // Exchange code for tokens
      const tokens = await providerCfg.exchangeToken({
        code,
        clientId:     input.clientId,
        clientSecret: input.clientSecret,
        codeVerifier,
        redirectUri:  REDIRECT_URI,
      });

      return {
        success: true,
        data: {
          provider:     input.provider,
          accessToken:  tokens.accessToken,
          refreshToken: tokens.refreshToken ?? null,
          expiresIn:    tokens.expiresIn ?? null,
          scope:        tokens.scope ?? input.scopes.join(" "),
          tokenType:    tokens.tokenType ?? "Bearer",
          message:      `✅ ${input.provider} OAuth flow completed. Tokens ready to save.`,
          nextStep:     "Call save_integration_credentials with the tokens above.",
        },
      };
    } catch (e: any) {
      return { success: false, error: `OAuth flow failed: ${e?.message ?? e}` };
    } finally {
      try { await browser?.close(); } catch { /* ignore */ }
    }
  },
});
