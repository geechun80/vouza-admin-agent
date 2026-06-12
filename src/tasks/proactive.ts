// =============================================================================
// Proactive Schedules — opt-out default briefings delivered to a channel
//
// On agent launch, if the user has at least one outbound channel configured
// (Telegram or WhatsApp), two default scheduled tasks are seeded:
//
//   morning-briefing  — daily 08:00 local  → daily-briefing skill
//   weekly-report     — Friday 17:00 local → weekly-report skill
//
// Records persist in data/scheduled-tasks.json. Seeding NEVER overwrites an
// existing record — user-customized times and `enabled:false` are respected
// forever. Skill output is delivered to Telegram (preferred) or WhatsApp
// (owner JID), with graceful fallback if the preferred channel send throws.
//
// Rule 52: the generated briefing never mentions models/providers.
// The "connect more sources" nag is throttled to once per 7 days (lastNagAt).
// =============================================================================

import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { join } from "path";
import type { AgentContext, SkillDefinition } from "../types/index.js";
import type { TaskScheduler } from "./scheduler.js";
import { logger } from "../util/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliveryChannel = "telegram" | "whatsapp";

export interface ProactiveScheduleRecord {
  id: string;            // stable id, e.g. "morning-briefing"
  label: string;         // human label for the UI
  skillName: string;     // bundled skill to run
  cron: string;          // cron expression (local time)
  enabled: boolean;      // user can turn off — stays off
  customized?: boolean;  // true once the user edits time/enabled — never reseeded
  lastNagAt?: number;    // epoch ms of last "connect more sources" suggestion
  lastRunAt?: number;
  lastDeliveredVia?: DeliveryChannel;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelState {
  telegramConfigured: boolean;
  telegramChatId: number | null;   // known owner chat (null until first message)
  whatsappConfigured: boolean;
  whatsappOwnerJid: string | null; // known once Baileys connects
}

export interface DeliverySenders {
  telegram: (text: string) => Promise<void>;
  whatsapp: (text: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SCHEDULE_TEMPLATES: Array<
  Pick<ProactiveScheduleRecord, "id" | "label" | "skillName" | "cron" | "enabled">
> = [
  {
    id:        "morning-briefing",
    label:     "Morning briefing",
    skillName: "daily-briefing",
    cron:      "0 8 * * *",   // daily 08:00 local
    enabled:   true,
  },
  {
    id:        "weekly-report",
    label:     "Weekly report",
    skillName: "weekly-report",
    cron:      "0 17 * * 5",  // Friday 17:00 local
    enabled:   true,
  },
];

const NAG_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Seed default records into an existing list.
 * - Only seeds when a channel is configured (hasChannel).
 * - NEVER touches existing records (disabled stays disabled, customized
 *   crons stay as the user set them).
 * - Idempotent: running twice adds nothing the second time.
 */
export function seedDefaultRecords(
  existing: ProactiveScheduleRecord[],
  hasChannel: boolean,
  now: number = Date.now()
): { records: ProactiveScheduleRecord[]; added: number } {
  if (!hasChannel) return { records: existing, added: 0 };

  const byId = new Set(existing.map((r) => r.id));
  const added: ProactiveScheduleRecord[] = [];

  for (const tpl of DEFAULT_SCHEDULE_TEMPLATES) {
    if (byId.has(tpl.id)) continue; // exists (possibly customized/disabled) — leave alone
    added.push({ ...tpl, createdAt: now, updatedAt: now });
  }

  return { records: [...existing, ...added], added: added.length };
}

/**
 * Resolve the delivery channel: Telegram if usable, else WhatsApp, else null.
 * Telegram is "usable" when configured AND we know the owner's chat id
 * (we can't initiate a Telegram conversation without one).
 */
export function resolveChannel(state: ChannelState): DeliveryChannel | null {
  if (state.telegramConfigured && state.telegramChatId !== null) return "telegram";
  if (state.whatsappConfigured && state.whatsappOwnerJid) return "whatsapp";
  return null;
}

/** Validate "HH:MM" 24h time. Returns {hour, minute} or null. */
export function parseTime(time: unknown): { hour: number; minute: number } | null {
  if (typeof time !== "string") return null;
  const m = time.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * Replace the time portion of a cron expression, preserving day-of-week /
 * day-of-month / month fields. Returns null when the time is invalid.
 */
export function applyTimeToCron(cron: string, time: string): string | null {
  const t = parseTime(time);
  if (!t) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return `${t.minute} ${t.hour} ${parts[2]} ${parts[3]} ${parts[4]}`;
}

/** Extract "HH:MM" from a 5-field cron (for the UI time picker). */
export function cronToTime(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "08:00";
  const minute = Number(parts[0]);
  const hour   = Number(parts[1]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return "08:00";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Apply a user update ({enabled, time}) to a record.
 * Bad time → error, record untouched. Marks the record customized so
 * seeding never resets it.
 */
export function applyScheduleUpdate(
  record: ProactiveScheduleRecord,
  update: { enabled?: unknown; time?: unknown },
  now: number = Date.now()
): { record: ProactiveScheduleRecord; error?: string } {
  const next = { ...record };

  if (update.time !== undefined) {
    if (typeof update.time !== "string") {
      return { record, error: "time must be a string in HH:MM format" };
    }
    const cron = applyTimeToCron(record.cron, update.time);
    if (!cron) {
      return { record, error: `Invalid time "${update.time}" — expected HH:MM (24h)` };
    }
    next.cron = cron;
  }

  if (update.enabled !== undefined) {
    if (typeof update.enabled !== "boolean") {
      return { record, error: "enabled must be a boolean" };
    }
    next.enabled = update.enabled;
  }

  next.customized = true;
  next.updatedAt  = now;
  return { record: next };
}

/** Weekly nag throttle: true only when never nagged or last nag ≥ 7 days ago. */
export function shouldNag(lastNagAt: number | undefined, now: number = Date.now()): boolean {
  if (lastNagAt === undefined) return true;
  return now - lastNagAt >= NAG_INTERVAL_MS;
}

/**
 * Deliver text to the preferred channel with graceful fallback.
 * Never throws. Returns which channel actually received the message.
 */
export async function deliver(
  text: string,
  preferred: DeliveryChannel,
  senders: DeliverySenders
): Promise<{ delivered: boolean; via?: DeliveryChannel }> {
  const order: DeliveryChannel[] =
    preferred === "telegram" ? ["telegram", "whatsapp"] : ["whatsapp", "telegram"];

  for (const ch of order) {
    try {
      await senders[ch](text);
      return { delivered: true, via: ch };
    } catch (err) {
      logger.warn(
        { event: "proactive_delivery_failed", channel: ch, err: String(err) },
        "Proactive delivery failed on channel — trying fallback"
      );
    }
  }
  return { delivered: false };
}

// ---------------------------------------------------------------------------
// Persistence — data/scheduled-tasks.json (atomic write-then-rename)
// ---------------------------------------------------------------------------

const STORE_PATH = join(process.cwd(), "data", "scheduled-tasks.json");

export async function loadScheduleStore(): Promise<ProactiveScheduleRecord[]> {
  try {
    const raw = await readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) => r && typeof r.id === "string" && typeof r.cron === "string"
    );
  } catch {
    return []; // missing/corrupt file → empty (fail-open, will reseed defaults)
  }
}

export async function saveScheduleStore(records: ProactiveScheduleRecord[]): Promise<void> {
  try {
    await mkdir(join(process.cwd(), "data"), { recursive: true });
    const tmp = `${STORE_PATH}.tmp`;
    await writeFile(tmp, JSON.stringify(records, null, 2), "utf-8");
    await rename(tmp, STORE_PATH);
  } catch (err) {
    logger.warn({ event: "schedule_store_save_failed", err: String(err) },
      "Could not persist scheduled-tasks.json");
  }
}

// ---------------------------------------------------------------------------
// Runtime wiring — registered on agent launch
// ---------------------------------------------------------------------------

let _scheduler: TaskScheduler | null = null;
let _context:   AgentContext  | null = null;
let _skills:    Map<string, SkillDefinition> | null = null;
/** record.id → scheduler task id, so updates can cancel + re-register */
const _liveTaskIds = new Map<string, string>();

/** Snapshot current channel state from runtime modules (lazy imports). */
async function getChannelState(ctx: AgentContext): Promise<ChannelState> {
  const tools = ctx.config.tools ?? {};
  let telegramChatId: number | null = null;
  let whatsappOwnerJid: string | null = null;

  try {
    const { getTelegramOwnerChatId } = await import("../telegram/listener.js");
    telegramChatId = await getTelegramOwnerChatId();
  } catch { /* listener unavailable */ }

  try {
    const { getBaileysOwnerJid } = await import("../whatsapp/baileysManager.js");
    whatsappOwnerJid = getBaileysOwnerJid();
  } catch { /* manager unavailable */ }

  return {
    telegramConfigured: !!tools.telegram?.botToken,
    telegramChatId,
    whatsappConfigured: !!tools.whatsapp?.provider,
    whatsappOwnerJid,
  };
}

/** Build live senders bound to the current context/runtime. */
async function buildSenders(ctx: AgentContext): Promise<DeliverySenders> {
  return {
    telegram: async (text: string) => {
      const token = ctx.config.tools?.telegram?.botToken;
      if (!token) throw new Error("Telegram not configured");
      const { getTelegramOwnerChatId, sendTelegramProactive } = await import("../telegram/listener.js");
      const chatId = await getTelegramOwnerChatId();
      if (chatId === null) throw new Error("Telegram owner chat unknown — user must message the bot once");
      await sendTelegramProactive(token, chatId, text);
    },
    whatsapp: async (text: string) => {
      const { getBaileysOwnerJid, sendBaileysMessage } = await import("../whatsapp/baileysManager.js");
      const jid = getBaileysOwnerJid();
      if (!jid) throw new Error("WhatsApp owner JID unknown — not connected");
      await sendBaileysMessage(jid, text);
    },
  };
}

/**
 * Build the skill prompt for a proactive run.
 * - Rule 52: never mention models/providers.
 * - Useful with zero data sources: states what IS available.
 * - includeNag controls the weekly "connect more sources" suggestion.
 */
export function buildProactivePrompt(
  record: Pick<ProactiveScheduleRecord, "label" | "skillName">,
  skill: SkillDefinition | undefined,
  opts: { hasEmail: boolean; hasCalendar: boolean; includeNag: boolean }
): string {
  const body = skill
    ? `Execute the "${skill.displayName}" skill.\n\n${skill.prompt}`
    : `Generate the user's ${record.label}.`;

  const missing: string[] = [];
  if (!opts.hasEmail)    missing.push("email");
  if (!opts.hasCalendar) missing.push("calendar");

  const lines = [
    body,
    "",
    "DELIVERY CONSTRAINTS (this output is sent automatically to the user's messaging app):",
    "- Write the final message text directly, ready to send as-is. No meta commentary about being an automated process.",
    "- NEVER mention AI model names, providers, routing, or internal errors.",
  ];

  if (missing.length > 0) {
    lines.push(
      `- The user's ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not connected — skip those sections silently and build the briefing from what IS available (memories, files, scheduled tasks, today's date).`
    );
    lines.push(
      opts.includeNag
        ? "- End with ONE short friendly line suggesting they connect email/calendar in the dashboard for richer briefings."
        : "- Do NOT suggest connecting more integrations in this message."
    );
  }

  return lines.join("\n");
}

/**
 * Initialize proactive schedules on agent launch:
 *  1. Seed defaults (only when a channel is configured, only if absent).
 *  2. Register cron jobs for all enabled records.
 * Safe to call once per launch. Never throws.
 */
export async function initProactiveSchedules(
  scheduler: TaskScheduler,
  context: AgentContext,
  skills: Map<string, SkillDefinition>
): Promise<void> {
  try {
    _scheduler = scheduler;
    _context   = context;
    _skills    = skills;
    _liveTaskIds.clear();

    const tools = context.config.tools ?? {};
    const hasChannel = !!tools.telegram?.botToken || !!tools.whatsapp?.provider;

    let records = await loadScheduleStore();
    const { records: seeded, added } = seedDefaultRecords(records, hasChannel);
    if (added > 0) {
      records = seeded;
      await saveScheduleStore(records);
      console.log(`  🔔 Proactive updates: seeded ${added} default schedule(s)`);
    }

    if (!hasChannel) {
      logger.info({ event: "proactive_skipped" },
        "No outbound channel connected — proactive schedules not registered");
      return;
    }

    for (const record of records) {
      if (record.enabled) registerRecord(record);
    }
  } catch (err) {
    logger.warn({ event: "proactive_init_failed", err: String(err) },
      "Proactive schedule init failed (agent continues)");
  }
}

/** Register one record's cron job with the live scheduler. */
function registerRecord(record: ProactiveScheduleRecord): void {
  if (!_scheduler || !_context || !_skills) return;
  const scheduler = _scheduler;
  const context   = _context;
  const skills    = _skills;

  try {
    const taskId = scheduler.schedule(
      {
        name:        record.label,
        description: `Proactive: ${record.label}`,
        schedule:    record.cron,
        maxRetries:  1,
      },
      {
        buildPrompt: async () => {
          const skill   = skills.get(record.skillName);
          const hasEmail    = context.tools.has("read_emails");
          const hasCalendar = context.tools.has("list_calendar_events");
          // Re-read the store so lastNagAt edits from other code paths count
          const stored  = (await loadScheduleStore()).find((r) => r.id === record.id);
          const includeNag = shouldNag(stored?.lastNagAt);
          return buildProactivePrompt(record, skill, { hasEmail, hasCalendar, includeNag });
        },
        onOutput: async (output: string) => {
          await deliverProactiveOutput(record.id, output);
        },
      }
    );
    _liveTaskIds.set(record.id, taskId);
  } catch (err) {
    logger.warn({ event: "proactive_register_failed", id: record.id, err: String(err) },
      "Could not register proactive schedule");
  }
}

/** Deliver a finished skill run to the resolved channel + desktop toast. */
async function deliverProactiveOutput(recordId: string, output: string): Promise<void> {
  if (!_context) return;
  const text = output.trim();
  if (!text) return;

  const state   = await getChannelState(_context);
  const channel = resolveChannel(state);

  if (!channel) {
    logger.info({ event: "proactive_no_channel", id: recordId },
      "Proactive output produced but no delivery channel available — skipped");
    return;
  }

  const senders = await buildSenders(_context);
  const result  = await deliver(text, channel, senders);

  // Persist run metadata (lastRunAt, lastNagAt when a nag could have fired)
  try {
    const records = await loadScheduleStore();
    const rec = records.find((r) => r.id === recordId);
    if (rec) {
      rec.lastRunAt = Date.now();
      if (result.delivered) {
        rec.lastDeliveredVia = result.via;
        const hasEmail    = _context.tools.has("read_emails");
        const hasCalendar = _context.tools.has("list_calendar_events");
        // The nag only appears when sources are missing AND throttle allowed it
        if ((!hasEmail || !hasCalendar) && shouldNag(rec.lastNagAt)) {
          rec.lastNagAt = Date.now();
        }
      }
      await saveScheduleStore(records);
    }
  } catch { /* metadata persistence is best-effort */ }

  if (result.delivered) {
    const label = recordId === "weekly-report" ? "Weekly report" : "Morning briefing";
    try {
      const { notifyDesktop } = await import("../util/notify.js");
      notifyDesktop("Admin Agent", `${label} delivered via ${result.via === "telegram" ? "Telegram" : "WhatsApp"}.`);
    } catch { /* notifications are fire-and-forget */ }
  }
}

/**
 * Update a schedule from the dashboard (POST /api/schedules/:id).
 * Persists to the store and re-registers the live cron job when running.
 */
export async function updateSchedule(
  id: string,
  update: { enabled?: unknown; time?: unknown }
): Promise<{ success: boolean; error?: string; record?: ProactiveScheduleRecord }> {
  let records = await loadScheduleStore();
  let rec = records.find((r) => r.id === id);

  // Allow editing a default before first launch seeded it
  if (!rec) {
    const tpl = DEFAULT_SCHEDULE_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return { success: false, error: `Unknown schedule: ${id}` };
    const now = Date.now();
    rec = { ...tpl, createdAt: now, updatedAt: now };
    records = [...records, rec];
  }

  const { record: next, error } = applyScheduleUpdate(rec, update);
  if (error) return { success: false, error };

  records = records.map((r) => (r.id === id ? next : r));
  await saveScheduleStore(records);

  // Re-register live cron job if the agent is running
  if (_scheduler) {
    const existingTaskId = _liveTaskIds.get(id);
    if (existingTaskId) {
      _scheduler.cancel(existingTaskId);
      _liveTaskIds.delete(id);
    }
    if (next.enabled) registerRecord(next);
  }

  return { success: true, record: next };
}

/** List schedules for the dashboard (seeds defaults virtually if store empty). */
export async function listSchedules(): Promise<
  Array<{ id: string; label: string; cron: string; time: string; enabled: boolean; channel: DeliveryChannel | "none" }>
> {
  const stored = await loadScheduleStore();
  const byId = new Map(stored.map((r) => [r.id, r]));

  // Show defaults (ON) for anything not yet persisted, plus any extra records
  const merged: ProactiveScheduleRecord[] = [
    ...DEFAULT_SCHEDULE_TEMPLATES.map((tpl) => byId.get(tpl.id) ?? { ...tpl, createdAt: 0, updatedAt: 0 }),
    ...stored.filter((r) => !DEFAULT_SCHEDULE_TEMPLATES.some((t) => t.id === r.id)),
  ];

  let channel: DeliveryChannel | "none" = "none";
  if (_context) {
    const state = await getChannelState(_context);
    channel = resolveChannel(state) ?? "none";
  }

  return merged.map((r) => ({
    id:      r.id,
    label:   r.label,
    cron:    r.cron,
    time:    cronToTime(r.cron),
    enabled: r.enabled,
    channel,
  }));
}

/** Reset runtime wiring (used by tests and agent stop). */
export function resetProactiveRuntime(): void {
  _scheduler = null;
  _context   = null;
  _skills    = null;
  _liveTaskIds.clear();
}
