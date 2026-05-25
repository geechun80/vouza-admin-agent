// =============================================================================
// Integration Interface — unified contract for every channel + tool
//
// PROBLEM this solves:
//   Every channel (Telegram, WhatsApp, Email) and tool (Calendar, Sheets,
//   Voice) currently has bespoke code for: starting, checking health,
//   resetting on failure, surfacing errors. That's 8+ different shapes of
//   integration code → 8+ different ways things can silently fail → 8+
//   different debugging stories for non-technical users like Aerick.
//
// SOLUTION:
//   Every integration implements the Integration interface below. The
//   registry treats them uniformly. The health monitor probes them uniformly.
//   The UI renders them uniformly. New integrations only have to implement
//   four methods to get monitoring + UI + auto-recovery for free.
// =============================================================================

/**
 * Standard status that every integration reports back from `getStatus()`.
 * Mirrors the rich set of states real systems go through, not just
 * connected/disconnected.
 */
export type IntegrationStatus =
  | "disabled"        // user hasn't enabled it
  | "unconfigured"    // enabled but missing credentials
  | "connecting"      // currently establishing connection
  | "connected"       // working and reachable
  | "degraded"        // working but reporting failures recently
  | "failed"          // last probe / use failed; needs attention
  | "cooldown";       // failed repeatedly, in auto-recovery wait

/**
 * Single point-in-time health check result. The health monitor calls
 * `probe()` on a schedule and aggregates these into status history.
 */
export interface IntegrationProbe {
  /** Overall pass/fail for this probe. */
  ok: boolean;
  /** Time the probe took (ms) — surface latency regressions. */
  latencyMs: number;
  /** Human-readable detail on success ("@vouzacatbot live") OR failure ("HTTP 401: invalid key"). */
  detail?: string;
  /** Specific error for failures — drives UI's "what should the user do?" copy. */
  errorCategory?: "auth" | "network" | "rate_limit" | "quota" | "stale_session" | "protocol" | "config" | "unknown";
  /** Wall-clock timestamp of the probe. */
  ts: string;
  /** Optional masked preview of the key/token used (first 8 + last 4 chars). */
  credentialPreview?: string;
}

/**
 * What the integration reports about its current state at any moment.
 * Drives the UI badge + Setup Status panel.
 */
export interface IntegrationStatusReport {
  status:       IntegrationStatus;
  /** Human-readable summary for the dashboard. */
  message?:     string;
  /** Last successful probe time (ISO). null if never connected. */
  lastSuccess?: string | null;
  /** Last failure time (ISO). null if no recent failures. */
  lastFailure?: string | null;
  /** Number of consecutive failures since last success. */
  consecutiveFailures?: number;
  /** Number of probes in the recent window (e.g. last hour). */
  recentProbeCount?: number;
}

/**
 * The contract every integration MUST implement.
 *
 * Design notes:
 *  - All methods are idempotent and safe to call from any code path
 *  - probe() must NEVER throw — failures returned as { ok: false }
 *  - reset() must be non-destructive to user data (wipe sessions, not configs)
 *  - getStatus() must be cheap (no network calls) — uses cached state
 */
export interface Integration {
  /** Stable identifier used in URLs, configs, and the registry. */
  readonly id: string;

  /** Human display name for the UI. */
  readonly displayName: string;

  /** Category for grouping in the Setup Status panel + diagnostics. */
  readonly category: "messaging" | "email" | "calendar" | "files" | "voice" | "ai" | "crm" | "search" | "other";

  /** Whether this integration is enabled in the user's current config. */
  isEnabled(): boolean;

  /**
   * Run a live health check against the integration's real endpoint.
   * Never throws — wraps any error as { ok: false, errorCategory: ... }.
   *
   * Should complete within ~5 seconds. Use AbortController with timeout.
   */
  probe(): Promise<IntegrationProbe>;

  /**
   * Return the current cached status. Should NOT make network calls —
   * just reports what the integration knows from its last probe + internal
   * state (e.g. listener running, sessions count).
   */
  getStatus(): IntegrationStatusReport;

  /**
   * Wipe any cached session/auth state and restart the connection.
   * Safe to call when already connected — will gracefully reconnect.
   *
   * Examples:
   *  - WhatsApp: rm -rf data/whatsapp-auth/ + restart Baileys worker
   *  - Telegram: stop/start the long-poll loop
   *  - AI provider: clear the AI SDK's internal HTTP client cache
   */
  reset(): Promise<{ ok: boolean; message: string }>;
}

/**
 * Metadata used by the registry + UI when listing all known integrations.
 * Returned by Integration's static factory or registration helper.
 */
export interface IntegrationMeta {
  id:           string;
  displayName:  string;
  category:     Integration["category"];
  description?: string;
  /** Where the user configures this integration in the wizard (channel | tool | credentials). */
  configLocation?: "channel" | "tool" | "credentials";
}
