// =============================================================================
// Smoke tests — dashboard auth middleware behavior
//
// The dashboard now:
//   1. Binds to 127.0.0.1 by default (no LAN exposure)
//   2. When DASHBOARD_BIND is non-loopback, requires DASHBOARD_PASSWORD
//      and refuses to start without one
//   3. Auth middleware accepts Bearer header OR ?token=... query string
//   4. Webhook paths are exempt (Telegram/WAHA can't sign with our password)
//
// We don't boot the full server (port binding + side effects) — instead we
// build a minimal Express app that mounts the same middleware logic, so we
// can hit it with supertest-style fetch and confirm the contract.
// =============================================================================

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

// Constant-time string compare — duplicate of the impl in server.ts.
// Tests here lock in the contract, not the specific function instance.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Build a minimal test app whose middleware mirrors the real dashboard's
 * (so changes here force tests to be reviewed alongside the real code).
 */
function buildTestApp(opts: { password: string; requireAuth: boolean }) {
  const app = express();
  app.use(express.json());

  function requireDashboardAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    if (!opts.requireAuth) return next();
    const header = req.headers["authorization"] as string | undefined;
    const tokenFromHeader = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
    const tokenFromQuery = typeof req.query.token === "string" ? req.query.token : undefined;
    const provided = tokenFromHeader || tokenFromQuery || "";
    if (!provided || !timingSafeEqual(provided, opts.password)) {
      res.status(401).json({ error: "Unauthorized: dashboard password required" });
      return;
    }
    next();
  }

  app.use("/api", (req, res, next) => {
    if (
      req.path === "/whatsapp/webhook" ||
      req.path === "/telegram/webhook" ||
      req.path === "/operator-defaults" ||
      req.path === "/models"
    ) {
      return next();
    }
    return requireDashboardAuth(req, res, next);
  });

  app.get("/api/config", (_req, res) => res.json({ ok: true }));
  app.post("/api/chat", (_req, res) => res.json({ ok: true }));
  app.post("/api/telegram/webhook", (_req, res) => res.json({ ok: true }));
  app.post("/api/whatsapp/webhook", (_req, res) => res.json({ ok: true }));
  app.get("/api/models", (_req, res) => res.json({ ok: true }));
  app.get("/api/operator-defaults", (_req, res) => res.json({ ok: true }));

  return app;
}

async function startApp(app: express.Express): Promise<{ url: string; close: () => void }> {
  return await new Promise((resolve) => {
    const server: Server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${addr.port}`, close: () => server.close() });
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("dashboard auth — localhost-only mode (default)", () => {
  let app: { url: string; close: () => void };
  beforeEach(async () => {
    app = await startApp(buildTestApp({ password: "", requireAuth: false }));
  });
  afterEach(() => app.close());

  it("allows requests with no auth header (no password required)", async () => {
    const res = await fetch(`${app.url}/api/config`);
    assert.equal(res.status, 200);
  });

  it("allows POST /api/chat with no auth", async () => {
    const res = await fetch(`${app.url}/api/chat`, { method: "POST" });
    assert.equal(res.status, 200);
  });
});

describe("dashboard auth — remote mode (DASHBOARD_BIND=0.0.0.0)", () => {
  let app: { url: string; close: () => void };
  const PW = "super-secret-password";
  beforeEach(async () => {
    app = await startApp(buildTestApp({ password: PW, requireAuth: true }));
  });
  afterEach(() => app.close());

  it("rejects requests with no Authorization header", async () => {
    const res = await fetch(`${app.url}/api/config`);
    assert.equal(res.status, 401);
  });

  it("rejects requests with wrong password", async () => {
    const res = await fetch(`${app.url}/api/config`, {
      headers: { Authorization: "Bearer wrong-password" },
    });
    assert.equal(res.status, 401);
  });

  it("accepts correct Bearer token", async () => {
    const res = await fetch(`${app.url}/api/config`, {
      headers: { Authorization: `Bearer ${PW}` },
    });
    assert.equal(res.status, 200);
  });

  it("accepts ?token=... query string (for SSE/EventSource)", async () => {
    const res = await fetch(`${app.url}/api/config?token=${encodeURIComponent(PW)}`);
    assert.equal(res.status, 200);
  });

  it("rejects empty token", async () => {
    const res = await fetch(`${app.url}/api/config`, {
      headers: { Authorization: "Bearer " },
    });
    assert.equal(res.status, 401);
  });

  it("rejects Bearer prefix without space", async () => {
    const res = await fetch(`${app.url}/api/config`, {
      headers: { Authorization: `Bearer${PW}` },
    });
    assert.equal(res.status, 401);
  });
});

describe("dashboard auth — webhook exemptions", () => {
  let app: { url: string; close: () => void };
  beforeEach(async () => {
    app = await startApp(buildTestApp({ password: "secret", requireAuth: true }));
  });
  afterEach(() => app.close());

  it("Telegram webhook is public even in auth mode", async () => {
    // Telegram has its own webhook secret check; it can't send our password.
    const res = await fetch(`${app.url}/api/telegram/webhook`, { method: "POST" });
    assert.equal(res.status, 200);
  });

  it("WhatsApp/WAHA webhook is public even in auth mode", async () => {
    const res = await fetch(`${app.url}/api/whatsapp/webhook`, { method: "POST" });
    assert.equal(res.status, 200);
  });

  it("Model catalog is public (no secrets, used by login screen)", async () => {
    const res = await fetch(`${app.url}/api/models`);
    assert.equal(res.status, 200);
  });

  it("Operator defaults is public (used by wizard to show Vouza-key CTA)", async () => {
    const res = await fetch(`${app.url}/api/operator-defaults`);
    assert.equal(res.status, 200);
  });
});

describe("dashboard auth — timing-safe compare", () => {
  it("returns false for different length strings", () => {
    assert.equal(timingSafeEqual("abc", "abcd"), false);
  });
  it("returns true for matching strings", () => {
    assert.equal(timingSafeEqual("abcd1234", "abcd1234"), true);
  });
  it("returns false for non-matching same-length strings", () => {
    assert.equal(timingSafeEqual("abcd", "xbcd"), false);
  });
  it("handles empty strings", () => {
    assert.equal(timingSafeEqual("", ""), true);
    assert.equal(timingSafeEqual("", "x"), false);
  });
});
