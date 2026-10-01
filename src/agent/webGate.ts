// =============================================================================
// Web gate — the agent goes online only when the person asked
//
// Searching the web or opening a website sends text off this computer (the
// search words, the address). Before this gate the model decided by itself
// when to do that — including while reading an untrusted email, which could
// say "search the web for <your private details>" and leak them in the query.
//
// Rule (enforced in code, not by the model):
//   • If the person's OWN message for this turn asks to go online ("search
//     online", "google it", "what's the news", a web address…), web tools run.
//   • Otherwise a web tool does nothing: it shows the exact search words or
//     address and waits for YES. YES allows it for one turn; NO stays offline.
//   • Scheduled runs and outside senders have no web tools at all
//     (toolProfiles.ts).
//
// ctx.onlineRequested is set by each listener from the person's typed or
// spoken words only — never from email, file, or web content.
// =============================================================================

import type { AgentContext, ToolDefinition, ToolResult } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { parkOnlineRequest } from "./phoneMode.js";

/** Tools that send something to the internet on the model's choice. */
// Clicking a link or submitting a form on an open page loads new pages too.
export const WEB_TOOL_NAMES: ReadonlySet<string> = new Set(["web_search", "browser_navigate", "browser_click", "browser_fill"]);

// "google" alone means the web; "Google Calendar/Drive/…" means the user's own data.
const GOOGLE_PRODUCT = /\bgoogle\s+(calendar|drive|sheets?|docs?|meet|account|workspace|contacts|mail|photos)\b/gi;

const ONLINE_PATTERNS: RegExp[] = [
  /\b(online|internet|on the (web|net)|website|web ?page|web site|browse|browser|bing|duckduckgo|look it up)\b/i,
  /\bgoogle\b/i,
  /\bsearch (the )?web\b|\bweb search\b/i,
  /\b(news|headlines|weather|forecast|exchange rate|stock price|share price)\b/i,
  /https?:\/\/\S+|\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
  /上网|网上|网络上|互联网|百度|谷歌|新闻|天气|汇率|股价/,
  /\b(dalam talian|cari di internet)\b/i,
];

/** Did the person's own words for this turn ask to go online? */
export function userAskedToGoOnline(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.replace(GOOGLE_PRODUCT, " ");
  return ONLINE_PATTERNS.some((re) => re.test(t));
}

function clip(s: unknown, n: number): string {
  const str = String(s ?? "").replace(/\s+/g, " ").trim();
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

/** What exactly would go online — shown to the person before they say YES. */
export function describeWebAction(toolName: string, input: any): string {
  if (toolName === "web_search") return `Search the web for: "${clip(input?.query, 120)}"`;
  if (toolName === "browser_navigate") return `Open the website: ${clip(input?.url, 160)}`;
  if (toolName === "browser_click")    return `Click "${clip(input?.selector, 80)}" on the open website`;
  if (toolName === "browser_fill")     return `Type into "${clip(input?.selector, 80)}" on the open website${input?.pressEnter ? " and submit" : ""}`;
  return `Go online (${toolName})`;
}

/** Copy of a web tool that only runs when going online was requested this turn. */
export function gateWebTool(tool: ToolDefinition): ToolDefinition {
  return {
    ...tool,
    async call(input: any, ctx: AgentContext): Promise<ToolResult> {
      if (ctx.onlineRequested) return tool.call(input, ctx);
      const what = describeWebAction(tool.name, input);
      if (!ctx.channel) {
        // No one to ask (API task / CLI): never go online on the model's say-so.
        return {
          success: false,
          error: `Not done — going online wasn't requested. If it would help, ask the user: ${what}?`,
        };
      }
      parkOnlineRequest(ctx.channel, tool.name, what);
      return {
        success: true,
        data: {
          status: "AWAITING_USER_PERMISSION",
          summary: what,
          instruction:
            "Nothing was searched or opened. You may only go online when the user asks. " +
            "Tell the user in plain words what you'd like to look up online and why, then wait — " +
            "if they say yes you can do it on your next turn. Do not call this tool again now.",
        },
      };
    },
  };
}

/**
 * Called by every listener at the start of a turn, with ONLY the person's
 * own words (typed, or their voice note's transcript). `granted` is true when
 * they just said YES to a parked "go online?" question.
 */
export function startTurn(ctx: AgentContext, ownWords: string, granted = false): void {
  ctx.onlineRequested = granted || userAskedToGoOnline(ownWords);
  ctx.userWords = ownWords;
  ctx.readUntrustedThisTurn = false; // memoryGuard.ts
}

/** Replace any registered web tools with gated versions (idempotent per tool object). */
export function gateWebTools(registry: ToolRegistry): void {
  for (const name of WEB_TOOL_NAMES) {
    const tool = registry.get(name);
    if (tool && !(tool as any).__webGated) {
      const gated = gateWebTool(tool);
      (gated as any).__webGated = true;
      registry.register(gated);
    }
  }
}
