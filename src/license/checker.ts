// =============================================================================
// License Checker — subscription heartbeat for Vouza.ai
// Validates that the user's subscription is active.
// Currently a STUB — wire up VOUZA_LICENSE_SERVER once vouza.ai backend is live.
// =============================================================================

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createHash, randomBytes } from "crypto";
import { hostname, platform, userInfo } from "os";

// ── Config ───────────────────────────────────────────────────────────────────

const LICENSE_SERVER = process.env.VOUZA_LICENSE_SERVER || "https://vouza.ai/api/license";
const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;  // 3 days
const TOKEN_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Types ────────────────────────────────────────────────────────────────────

export interface LicenseStatus {
  valid: boolean;
  plan: string;
  deviceId: string;
  expiresAt: number | null;     // token expiry timestamp
  gracePeriodEnds: number | null;
  lastChecked: number | null;
  message: string;
}

interface StoredLicense {
  licenseKey: string;
  deviceId: string;
  token: string | null;
  tokenExpiresAt: number | null;
  lastHeartbeat: number | null;
  gracePeriodStart: number | null;
  plan: string;
}

// ── Device fingerprint ────────────────────────────────────────────────────────

/**
 * Stable machine identifier — hashed from hostname + platform + username.
 * Not cryptographically unique but consistent across restarts.
 */
export function getDeviceId(): string {
  const raw = `${hostname()}|${platform()}|${userInfo().username}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

// ── Local token store ─────────────────────────────────────────────────────────

async function loadStored(dataDir: string): Promise<StoredLicense | null> {
  try {
    const raw = await readFile(join(dataDir, "license.json"), "utf-8");
    return JSON.parse(raw) as StoredLicense;
  } catch {
    return null;
  }
}

async function saveStored(dataDir: string, data: StoredLicense): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, "license.json"), JSON.stringify(data, null, 2), "utf-8");
}

// ── License checker class ─────────────────────────────────────────────────────

export class LicenseChecker {
  private dataDir: string;
  private licenseKey: string;
  private stored: StoredLicense | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dataDir: string, licenseKey: string) {
    this.dataDir = dataDir;
    this.licenseKey = licenseKey;
  }

  async initialize(): Promise<LicenseStatus> {
    this.stored = await loadStored(this.dataDir);

    // First run — create stored record
    if (!this.stored) {
      this.stored = {
        licenseKey: this.licenseKey,
        deviceId: getDeviceId(),
        token: null,
        tokenExpiresAt: null,
        lastHeartbeat: null,
        gracePeriodStart: null,
        plan: "unknown",
      };
    }

    // Update license key if changed
    this.stored.licenseKey = this.licenseKey;
    this.stored.deviceId = getDeviceId();

    const status = await this.check();
    this.startHeartbeat();
    return status;
  }

  /**
   * Check license validity. Uses cached token when fresh; hits server when stale.
   */
  async check(): Promise<LicenseStatus> {
    const deviceId = getDeviceId();

    // ── STUB MODE: no license key configured ──────────────────────────────
    // Remove this block once vouza.ai backend is live and license keys are issued
    if (!this.licenseKey || this.licenseKey === "dev" || this.licenseKey === "") {
      return {
        valid: true,
        plan: "development",
        deviceId,
        expiresAt: null,
        gracePeriodEnds: null,
        lastChecked: Date.now(),
        message: "Development mode — license validation bypassed.",
      };
    }

    // ── Check cached token ────────────────────────────────────────────────
    const now = Date.now();
    if (
      this.stored?.token &&
      this.stored.tokenExpiresAt &&
      this.stored.tokenExpiresAt > now
    ) {
      return {
        valid: true,
        plan: this.stored.plan,
        deviceId,
        expiresAt: this.stored.tokenExpiresAt,
        gracePeriodEnds: null,
        lastChecked: this.stored.lastHeartbeat,
        message: "License valid.",
      };
    }

    // ── Hit license server ────────────────────────────────────────────────
    return this.heartbeat();
  }

  /**
   * Ping Vouza license server for a fresh token.
   * TODO: uncomment fetch() block when vouza.ai/api/license is live.
   */
  async heartbeat(): Promise<LicenseStatus> {
    const deviceId = getDeviceId();
    const now = Date.now();

    if (!this.stored) {
      this.stored = {
        licenseKey: this.licenseKey,
        deviceId,
        token: null,
        tokenExpiresAt: null,
        lastHeartbeat: null,
        gracePeriodStart: null,
        plan: "unknown",
      };
    }

    // ── STUB: Vouza.ai backend not yet live ───────────────────────────────
    // When live, replace this block with the fetch() call below
    if (!this.licenseKey || this.licenseKey === "dev" || this.licenseKey === "") {
      return {
        valid: true,
        plan: "development",
        deviceId,
        expiresAt: null,
        gracePeriodEnds: null,
        lastChecked: now,
        message: "Development mode.",
      };
    }

    /*
    // ── PRODUCTION heartbeat (enable when vouza.ai backend is live) ───────
    try {
      const resp = await fetch(`${LICENSE_SERVER}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: this.licenseKey,
          deviceId,
          agentType: "admin-agent",
          version: process.env.npm_package_version || "2.0.0",
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.ok) {
        const data = await resp.json() as {
          valid: boolean;
          token: string;
          expiresAt: number;
          plan: string;
        };

        if (data.valid) {
          this.stored.token = data.token;
          this.stored.tokenExpiresAt = data.expiresAt;
          this.stored.lastHeartbeat = now;
          this.stored.gracePeriodStart = null;
          this.stored.plan = data.plan;
          await saveStored(this.dataDir, this.stored);

          return {
            valid: true,
            plan: data.plan,
            deviceId,
            expiresAt: data.expiresAt,
            gracePeriodEnds: null,
            lastChecked: now,
            message: "License valid.",
          };
        }
      }

      // Server responded but subscription is not valid
      this.stored.gracePeriodStart = this.stored.gracePeriodStart || now;
      await saveStored(this.dataDir, this.stored);

    } catch {
      // Network error — use grace period
      this.stored.gracePeriodStart = this.stored.gracePeriodStart || now;
      await saveStored(this.dataDir, this.stored);
    }

    // ── Grace period logic ────────────────────────────────────────────────
    const graceStart = this.stored.gracePeriodStart || now;
    const gracePeriodEnds = graceStart + GRACE_PERIOD_MS;

    if (now < gracePeriodEnds) {
      return {
        valid: true,
        plan: this.stored.plan,
        deviceId,
        expiresAt: null,
        gracePeriodEnds,
        lastChecked: now,
        message: `⚠️ Cannot reach license server — grace period active until ${new Date(gracePeriodEnds).toLocaleDateString()}.`,
      };
    }

    return {
      valid: false,
      plan: this.stored.plan,
      deviceId,
      expiresAt: null,
      gracePeriodEnds,
      lastChecked: now,
      message: "Subscription expired. Renew at vouza.ai to continue.",
    };
    */

    // Stub fallback until backend is live
    this.stored.lastHeartbeat = now;
    await saveStored(this.dataDir, this.stored);

    return {
      valid: true,
      plan: "development",
      deviceId,
      expiresAt: null,
      gracePeriodEnds: null,
      lastChecked: now,
      message: "Development mode — license server not yet connected.",
    };
  }

  /** Start background heartbeat every 6 hours. */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat().catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
    // Don't block process exit
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ── Singleton for the running agent ──────────────────────────────────────────

let _checker: LicenseChecker | null = null;

export function getLicenseChecker(dataDir: string, licenseKey: string): LicenseChecker {
  if (!_checker) {
    _checker = new LicenseChecker(dataDir, licenseKey);
  }
  return _checker;
}
