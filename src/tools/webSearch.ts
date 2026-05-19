// =============================================================================
// Web Search Tool — gives the agent real-time internet access
//
// Provider priority (first configured key wins):
//   1. Tavily   — tavily.com (1,000 free searches/month, designed for AI agents)
//   2. Serper   — serper.dev (2,500 free searches/month, Google results)
//   3. Brave    — brave.com/search/api (2,000 free/month, privacy-first)
//   4. DDGS     — DuckDuckGo HTML scrape (no key required, always available)
//                 Inspired by Hermes v0.14.0 "DDGS as web-search provider"
//
// Configuration:
//   Set any one of these in your .env or start.bat:
//     TAVILY_API_KEY=tvly-xxx
//     SERPER_API_KEY=xxx
//     BRAVE_SEARCH_KEY=BSA-xxx
//   Or add via the setup wizard credentials.
// =============================================================================

import { z }          from "zod";
import { buildTool }  from "./registry.js";

// ─── Provider implementations ─────────────────────────────────────────────────

interface SearchResult {
  title:   string;
  url:     string;
  snippet: string;
}

async function tavilySearch(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:             apiKey,
      query,
      max_results:         maxResults,
      search_depth:        "basic",
      include_answer:      true,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const results: SearchResult[] = [];

  // Tavily returns a top-level answer + individual results
  if (data.answer) {
    results.push({ title: "Direct Answer", url: "", snippet: data.answer });
  }
  for (const r of data.results ?? []) {
    results.push({ title: r.title || "", url: r.url || "", snippet: r.content || "" });
  }
  return results.slice(0, maxResults + 1); // +1 for the direct answer
}

async function serperSearch(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: maxResults }),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const results: SearchResult[] = [];
  // Answer box if present
  if (data.answerBox?.answer) {
    results.push({ title: "Answer", url: data.answerBox?.link || "", snippet: data.answerBox.answer });
  }
  for (const r of data.organic ?? []) {
    results.push({ title: r.title || "", url: r.link || "", snippet: r.snippet || "" });
  }
  return results.slice(0, maxResults + 1);
}

async function braveSearch(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  url.searchParams.set("safesearch", "moderate");

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
  });
  if (!res.ok) throw new Error(`Brave ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return (data.web?.results ?? []).map((r: any) => ({
    title:   r.title   || "",
    url:     r.url     || "",
    snippet: r.description || "",
  })).slice(0, maxResults);
}

// ─── DuckDuckGo free fallback ──────────────────────────────────────────────────
// No API key required. Scrapes html.duckduckgo.com — suitable as a last resort
// when no paid key is configured. Rate-limited by DDG to ~60 req/min.
// Inspired by Hermes v0.14.0: "DuckDuckGo (DDGS) as web-search provider".

async function ddgsSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept":        "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: new URLSearchParams({ q: query, b: "" }).toString(),
  });
  if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);

  const html = await res.text();
  const results: SearchResult[] = [];

  // Parse result links (<a class="result__a">) and snippets (<a class="result__snippet">)
  // We use simple regex rather than a DOM parser to avoid a dependency.
  const linkRx    = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRx = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const links:    Array<{ url: string; title: string }> = [];
  const snippets: string[] = [];

  let m: RegExpExecArray | null;

  while ((m = linkRx.exec(html)) !== null && links.length < maxResults) {
    // DDG wraps external URLs — extract the real URL from uddg param
    let url = m[1];
    try {
      const parsed = new URL("https://duckduckgo.com" + url);
      url = parsed.searchParams.get("uddg") ?? url;
      url = decodeURIComponent(url);
    } catch { /* keep original */ }
    const title = m[2].replace(/<[^>]*>/g, "").trim();
    if (url.startsWith("http") && title) links.push({ url, title });
  }

  while ((m = snippetRx.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({ title: links[i].title, url: links[i].url, snippet: snippets[i] ?? "" });
  }
  return results;
}

// ─── Key resolution ────────────────────────────────────────────────────────────

interface SearchConfig {
  provider: "tavily" | "serper" | "brave" | "ddgs" | "none";
  apiKey:   string;
}

function resolveSearchConfig(context: any): SearchConfig {
  const creds = context?.config?.tools?.webSearch || {};

  const tavilyKey = process.env.TAVILY_API_KEY   || creds.tavilyApiKey   || "";
  const serperKey = process.env.SERPER_API_KEY    || creds.serperApiKey   || "";
  const braveKey  = process.env.BRAVE_SEARCH_KEY  || creds.braveSearchKey || "";

  if (tavilyKey)  return { provider: "tavily", apiKey: tavilyKey };
  if (serperKey)  return { provider: "serper", apiKey: serperKey };
  if (braveKey)   return { provider: "brave",  apiKey: braveKey  };
  // DuckDuckGo — always available, no key needed
  return           { provider: "ddgs",  apiKey: ""           };
}

// ─── Tool definition ───────────────────────────────────────────────────────────

export const webSearchTool = buildTool({
  name: "web_search",
  description:
    "Search the web for current, real-time information. Use this when the user asks about: " +
    "recent news, current prices, company information, product details, live data, " +
    "today's events, or anything that may have changed since your training cutoff. " +
    "Returns a list of results with titles, URLs, and content snippets.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,

  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .max(400)
      .describe("The search query. Be specific and include key terms for best results."),
    max_results: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe("Number of results to return (1–10, default 5)."),
  }),

  call: async (input, context) => {
    const { provider, apiKey } = resolveSearchConfig(context);
    const maxResults = input.max_results ?? 5;

    try {
      let results: SearchResult[];

      switch (provider) {
        case "tavily": results = await tavilySearch(input.query, apiKey, maxResults); break;
        case "serper": results = await serperSearch(input.query, apiKey, maxResults); break;
        case "brave":  results = await braveSearch(input.query, apiKey, maxResults);  break;
        case "ddgs":   results = await ddgsSearch(input.query, maxResults);           break;
        default:       results = [];
      }

      if (results.length === 0) {
        return { success: true, data: `No results found for: "${input.query}"` };
      }

      const formatted = results
        .map((r, i) => {
          const num     = `${i + 1}.`;
          const title   = r.title   ? `**${r.title}**`          : "";
          const url     = r.url     ? `\n   🔗 ${r.url}`        : "";
          const snippet = r.snippet ? `\n   ${r.snippet.slice(0, 300)}` : "";
          return `${num} ${title}${url}${snippet}`;
        })
        .join("\n\n");

      const providerLabel = provider === "ddgs" ? "DuckDuckGo" : provider;
      return {
        success: true,
        data:
          `Search results for: "${input.query}" (via ${providerLabel})\n\n` +
          formatted,
      };
    } catch (err) {
      return {
        success: false,
        data:    `Web search failed: ${err instanceof Error ? err.message : String(err)}`,
        error:   String(err),
      };
    }
  },
});
