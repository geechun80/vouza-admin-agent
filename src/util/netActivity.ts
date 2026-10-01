// =============================================================================
// Network activity log — every outside service this computer's agent contacts
//
// "Does it talk to the internet behind my back?" should be answerable by
// looking, not by trusting. Every outgoing connection is recorded here with
// the reason it happened, and the dashboard shows it (Health → Network).
//
// How connections are captured:
//   • fetch()  — a wrapper on globalThis.fetch records every request the main
//                process makes (AI providers, Telegram, WhatsApp-WAHA, web
//                search, Microsoft Graph, key checks…).
//   • Others   — libraries that open their own sockets call recordNet():
//                IMAP/SMTP (email), googleapis (Gmail/Calendar/Sheets), the
//                Playwright browser, the WhatsApp (Baileys) connection, and
//                DNS mail lookups during Quick Setup.
//
// Why it happened: an AsyncLocalStorage label set at each entry point —
// "your message (WhatsApp)", "scheduled task", "health check", "setup" —
// follows the work through every await. Anything unlabelled is "background".
//
// Only host names and short descriptions are kept — never URLs with query
// strings, message text, or keys — in memory only, last 300 entries.
// =============================================================================

import { AsyncLocalStorage } from "async_hooks";

export type NetCategory =
  | "AI model"
  | "Email"
  | "Google account"
  | "Microsoft account"
  | "Messaging"
  | "Web search"
  | "Website"
  | "This computer"
  | "Other";

export interface NetEvent {
  at:       string;
  host:     string;
  category: NetCategory;
  /** Why: "your message (WhatsApp)", "scheduled task", "health check"… */
  trigger:  string;
  /** What: "GET", "IMAP", "open website"… */
  what:     string;
  ok?:      boolean;
}

export interface NetHostSummary {
  host:        string;
  category:    NetCategory;
  count:       number;
  lastAt:      string;
  lastTrigger: string;
}

const MAX_EVENTS = 300;
const events: NetEvent[] = [];
const hosts = new Map<string, NetHostSummary>();
const startedAt = new Date().toISOString();
const triggerStore = new AsyncLocalStorage<string>();

export const TRIGGER_BACKGROUND = "background";

/** Run `fn` with a reason label that every connection inside it inherits. */
export function withTrigger<T>(label: string, fn: () => T): T {
  return triggerStore.run(label, fn);
}

/** Wrap an async generator so every step runs under the label. */
export async function* withTriggerGen<T>(label: string, gen: AsyncGenerator<T>): AsyncGenerator<T> {
  while (true) {
    const step = await triggerStore.run(label, () => gen.next());
    if (step.done) return;
    yield step.value;
  }
}

export function currentTrigger(): string {
  return triggerStore.getStore() ?? TRIGGER_BACKGROUND;
}

const CATEGORY_RULES: Array<[RegExp, NetCategory]> = [
  [/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i, "This computer"],
  [/(^|\.)(anthropic\.com|openai\.com|openrouter\.ai|x\.ai|deepseek\.com|dashscope[\w-]*\.aliyuncs\.com|moonshot\.cn|groq\.com)$/i, "AI model"],
  [/(^|\.)generativelanguage\.googleapis\.com$/i, "AI model"],
  [/(^|\.)(googleapis\.com|accounts\.google\.com|oauth2\.googleapis\.com)$/i, "Google account"],
  [/(^|\.)(graph\.microsoft\.com|login\.microsoftonline\.com)$/i, "Microsoft account"],
  [/^(imap|smtp|pop|mail)[\w.-]*\.|(^|\.)(gmail\.com|outlook\.com|office365\.com|yahoo\.com|icloud\.com|me\.com|zoho\.com|agentmail\.to)$/i, "Email"],
  [/(^|\.)(telegram\.org|whatsapp\.(net|com)|web\.whatsapp\.com)$/i, "Messaging"],
  [/(^|\.)(tavily\.com|serper\.dev|search\.brave\.com|api\.search\.brave\.com|duckduckgo\.com|bing\.com|searx[\w.-]*|wikipedia\.org)$/i, "Web search"],
];

export function categorizeHost(host: string, hint?: NetCategory): NetCategory {
  if (hint) return hint;
  for (const [re, cat] of CATEGORY_RULES) if (re.test(host)) return cat;
  return "Other";
}

/** Record one outgoing connection. Never throws. */
export function recordNet(host: string, what: string, opts: { category?: NetCategory; ok?: boolean; trigger?: string } = {}): void {
  try {
    const h = String(host || "").toLowerCase().replace(/:\d+$/, "") || "unknown";
    const ev: NetEvent = {
      at:       new Date().toISOString(),
      host:     h,
      category: categorizeHost(h, opts.category),
      trigger:  opts.trigger ?? currentTrigger(),
      what:     String(what).slice(0, 60),
      ...(opts.ok === undefined ? {} : { ok: opts.ok }),
    };
    events.push(ev);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    const s = hosts.get(h);
    if (s) {
      s.count++;
      s.lastAt = ev.at;
      s.lastTrigger = ev.trigger;
    } else {
      hosts.set(h, { host: h, category: ev.category, count: 1, lastAt: ev.at, lastTrigger: ev.trigger });
    }
  } catch { /* logging must never break the call it describes */ }
}

/** Host of a URL string / URL / Request — never the path or query. */
export function hostOf(input: unknown): string {
  try {
    const raw = typeof input === "string" ? input
      : input instanceof URL ? input.href
      : (input as { url?: string })?.url ?? "";
    return new URL(raw).host;
  } catch {
    return "unknown";
  }
}

let fetchInstalled = false;

/** Record every global fetch() the process makes. Idempotent. */
export function installFetchLogger(): void {
  if (fetchInstalled || typeof globalThis.fetch !== "function") return;
  fetchInstalled = true;
  const original = globalThis.fetch;
  const logged = async function loggedFetch(input: any, init?: any): Promise<Response> {
    const host = hostOf(input);
    const method = String(init?.method ?? (input as Request)?.method ?? "GET").toUpperCase();
    try {
      const res = await original(input, init);
      recordNet(host, method, { ok: res.ok });
      return res;
    } catch (err) {
      recordNet(host, method, { ok: false });
      throw err;
    }
  };
  globalThis.fetch = logged as typeof fetch;
}

export interface NetActivitySnapshot {
  since:  string;
  total:  number;
  hosts:  NetHostSummary[];
  recent: NetEvent[];
}

export function getNetActivity(limit = 100): NetActivitySnapshot {
  return {
    since:  startedAt,
    total:  [...hosts.values()].reduce((n, h) => n + h.count, 0),
    hosts:  [...hosts.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    recent: events.slice(-limit).reverse(),
  };
}

/** Test hook. */
export function __resetNetActivityForTests(): void {
  events.length = 0;
  hosts.clear();
}
