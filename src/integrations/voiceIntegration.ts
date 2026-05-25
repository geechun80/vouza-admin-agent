// =============================================================================
// Voice (Whisper) Integration Adapter
//
// Voice transcription via Groq Whisper (free, fast) or OpenAI Whisper.
// No persistent connection — each transcription is a one-off API call.
// Probe just verifies the API key is valid by hitting /models.
//
// Reset is a no-op (no session state) — clears the failure counter for a
// fresh probe attempt.
// =============================================================================

import type { Integration, IntegrationProbe, IntegrationStatusReport } from "./types.js";
import type { AgentContext } from "../types/index.js";

const PROBE_TIMEOUT_MS = 6_000;

function maskKey(k: string | undefined): string | undefined {
  if (!k) return undefined;
  return k.length < 14 ? "***" : `${k.slice(0, 8)}…${k.slice(-4)}`;
}

export class VoiceIntegration implements Integration {
  readonly id = "voice";
  readonly displayName = "Voice Transcription";
  readonly category = "voice" as const;

  private _lastSuccessAt: string | null = null;
  private _lastFailureAt: string | null = null;
  private _consecutiveFailures = 0;
  private _provider: "groq" | "openai" | null = null;

  constructor(private context: () => AgentContext | null) {}

  // ── Resolve which Whisper key + provider to use ──────────────────────────
  // Mirror src/voice/transcriber.ts resolution: prefer Groq (free + fast),
  // fall back to OpenAI.
  private resolveProvider(): { provider: "groq" | "openai"; key: string } | null {
    const ctx = this.context();
    if (!ctx) return null;
    const creds = (ctx.config as any).credentials || {};
    if (creds.groqApiKey) return { provider: "groq", key: creds.groqApiKey };
    if (creds.openaiVoiceKey) return { provider: "openai", key: creds.openaiVoiceKey };
    return null;
  }

  isEnabled(): boolean {
    return this.resolveProvider() !== null;
  }

  async probe(): Promise<IntegrationProbe> {
    const t0 = Date.now();
    const now = new Date().toISOString();
    const resolved = this.resolveProvider();

    if (!resolved) {
      return { ok: true, latencyMs: 0, detail: "Disabled (no Whisper key)", ts: now };
    }

    this._provider = resolved.provider;
    const url = resolved.provider === "groq"
      ? "https://api.groq.com/openai/v1/models"
      : "https://api.openai.com/v1/models";

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${resolved.key}` },
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        let errorCategory: IntegrationProbe["errorCategory"] = "unknown";
        if (r.status === 401 || r.status === 403) errorCategory = "auth";
        else if (r.status === 429)                 errorCategory = "rate_limit";
        else if (r.status >= 500)                  errorCategory = "network";
        this._lastFailureAt = now;
        this._consecutiveFailures++;
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          errorCategory,
          detail: `HTTP ${r.status}: ${body.slice(0, 150) || r.statusText}`,
          credentialPreview: maskKey(resolved.key),
          ts: now,
        };
      }

      this._lastSuccessAt = now;
      this._consecutiveFailures = 0;
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        detail: `${resolved.provider === "groq" ? "Groq Whisper" : "OpenAI Whisper"} key valid`,
        credentialPreview: maskKey(resolved.key),
        ts: now,
      };
    } catch (err: any) {
      clearTimeout(t);
      this._lastFailureAt = now;
      this._consecutiveFailures++;
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        errorCategory: "network",
        detail: `Network error: ${String(err?.message || err).slice(0, 150)}`,
        credentialPreview: maskKey(resolved.key),
        ts: now,
      };
    }
  }

  getStatus(): IntegrationStatusReport {
    const resolved = this.resolveProvider();
    if (!resolved) return { status: "disabled", message: "No Whisper key configured" };

    if (this._consecutiveFailures === 0 && this._lastSuccessAt) {
      return {
        status: "connected",
        message: `${this._provider === "groq" ? "Groq" : "OpenAI"} Whisper ready`,
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: 0,
      };
    }

    if (this._consecutiveFailures > 0) {
      return {
        status: this._consecutiveFailures >= 3 ? "failed" : "degraded",
        message: "Whisper key probe failed",
        lastFailure: this._lastFailureAt,
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: this._consecutiveFailures,
      };
    }

    return { status: "connecting", message: "Verifying Whisper key…" };
  }

  async reset(): Promise<{ ok: boolean; message: string }> {
    // No session state to wipe — Voice is a stateless one-off call per
    // transcription. Just clear our failure counters for a fresh probe.
    this._consecutiveFailures = 0;
    this._lastFailureAt = null;
    return { ok: true, message: "Voice integration reset — next probe will re-verify the key." };
  }
}
