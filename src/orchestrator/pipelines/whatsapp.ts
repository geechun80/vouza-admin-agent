// =============================================================================
// WhatsApp (Baileys) Pipeline.
//
// WhatsApp via Baileys uses QR pairing — credentials aren't saved as text.
// So the pipeline is shorter: detect (binary present), validate (allowlist),
// test (IPC ping), save (no-op), confirm, live-test (worker reports connected).
// =============================================================================

import type { Pipeline, Step, StepResult } from "../types.js";

export interface WhatsAppDeps {
  /** Returns true if Baileys runtime is reachable on disk / via require. */
  isBaileysAvailable?: () => Promise<boolean>;
  /** Read the configured allowlist (returns array of JIDs, may be empty). */
  readAllowlist?: () => Promise<string[]>;
  /** IPC ping → resolves on pong, rejects on no-pong. */
  pingWorker?: () => Promise<void>;
  /** Status probe — returns "connected" when worker is live. */
  workerStatus?: () => Promise<{ state: "connected" | "qr" | "disconnected" | string }>;
  /** Sleep used to gate worker-status polling. */
  sleep?: (ms: number) => Promise<void>;
}

export function makeWhatsAppPipeline(deps: WhatsAppDeps = {}): Pipeline {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const detect: Step = {
    name: "detect",
    async run(): Promise<StepResult<any>> {
      try {
        const present = deps.isBaileysAvailable ? await deps.isBaileysAvailable() : true;
        if (!present) {
          return {
            ok: false,
            error: "Baileys runtime not found.",
            suggestedFix:
              "Reinstall the admin-agent package — @whiskeysockets/baileys should be in node_modules.",
            doNotRetry: true,
          };
        }
        return { ok: true, value: { baileysPresent: true } };
      } catch (e) {
        return {
          ok: false,
          error: `Could not check for Baileys: ${String((e as any)?.message ?? e)}`,
        };
      }
    },
  };

  const validate: Step = {
    name: "validate",
    async run(): Promise<StepResult<any>> {
      try {
        const allow = deps.readAllowlist ? await deps.readAllowlist() : [];
        // Empty allowlist is OK (deny-by-default still permits owner). Just
        // record the count for the audit log.
        return { ok: true, value: { allowlistCount: allow.length } };
      } catch (e) {
        return {
          ok: false,
          error: `Could not read WhatsApp allowlist: ${String((e as any)?.message ?? e)}`,
          suggestedFix: "Check data/config.json is readable.",
        };
      }
    },
  };

  const test: Step = {
    name: "test",
    async run(): Promise<StepResult<any>> {
      try {
        if (deps.pingWorker) await deps.pingWorker();
        return { ok: true, value: { workerReachable: true } };
      } catch (e) {
        return {
          ok: false,
          error: `WhatsApp worker did not respond to ping: ${String((e as any)?.message ?? e)}`,
          suggestedFix:
            "Open the dashboard's WhatsApp panel and scan the QR code with WhatsApp → Linked Devices.",
        };
      }
    },
  };

  // save is a no-op for Baileys — auth lives in data/whatsapp-auth/ written by
  // the QR pairing flow. Pipeline still calls save() for symmetry; it's
  // idempotent because doing nothing twice is still nothing.
  const save: Step = {
    name: "save",
    async run(): Promise<StepResult<any>> {
      return { ok: true, value: { saved: true, note: "Baileys auth is QR-managed; no save needed." } };
    },
  };

  const confirm: Step = {
    name: "confirm",
    async run(): Promise<StepResult<any>> {
      return { ok: true, value: { confirmed: true } };
    },
  };

  const liveTest: Step = {
    name: "live-test",
    async run(): Promise<StepResult<any>> {
      // Poll up to 5s for connected status.
      const deadline = Date.now() + 5000;
      let last = "unknown";
      while (Date.now() < deadline) {
        try {
          const s = deps.workerStatus ? await deps.workerStatus() : { state: "connected" };
          last = s.state;
          if (last === "connected") {
            return { ok: true, value: { liveTested: true } };
          }
        } catch {
          // ignore — keep polling
        }
        await sleep(250);
      }
      return {
        ok: false,
        error: `WhatsApp worker did not reach "connected" within 5s (last state: ${last}).`,
        suggestedFix:
          last === "qr"
            ? "Scan the QR code shown in the dashboard to finish pairing."
            : "Open the dashboard's WhatsApp panel and re-pair the device.",
      };
    },
  };

  return {
    id: "whatsapp",
    steps: [detect, validate, test, save, confirm, liveTest],
  };
}

export const whatsappPipeline = makeWhatsAppPipeline();
