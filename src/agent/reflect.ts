// =============================================================================
// Auto-Reflection — extracts memorable facts from completed conversations
// Runs asynchronously after each task so it never slows down responses.
// =============================================================================

import type { AgentContext, ConversationMessage, MemoryType } from "../types/index.js";

const REFLECT_SYSTEM_PROMPT = `You are a memory extraction assistant for an AI office admin agent.
Analyze the conversation and extract facts worth remembering long-term.

Focus ONLY on:
- Contact details (names, emails, phone numbers, roles, companies)
- User preferences (how they like things done, formats, tone, timing)
- Recurring processes (workflows the user follows, SOPs)
- Important corrections the user gave (feedback on agent mistakes)
- Key patterns (recurring tasks, regular meeting times, frequent contacts)

IGNORE:
- One-off task details (specific email content, individual appointments)
- Performance metrics
- Small talk

Output a JSON array. Each item: { "type": "contact|process|preference|feedback|pattern", "title": "short title", "content": "detailed fact", "tags": ["tag1","tag2"] }
Output [] if nothing is worth remembering.
Output ONLY the JSON array, no explanation.`;

interface ReflectedFact {
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
}

/**
 * Fire-and-forget: extract memorable facts from a completed conversation
 * and save them to the memory store.
 */
export async function autoReflect(
  messages: ConversationMessage[],
  context: AgentContext
): Promise<void> {
  try {
    // Build a condensed conversation summary (last 10 messages, skip tool results)
    const relevant = messages
      .filter((m) => {
        if (typeof m.content !== "string") return false;
        if (m.content.length < 10) return false;
        return true;
      })
      .slice(-10)
      .map((m) => `${m.role.toUpperCase()}: ${(m.content as string).slice(0, 500)}`)
      .join("\n\n");

    if (!relevant || relevant.length < 50) return;

    const prompt = `Conversation to analyze:\n\n${relevant}\n\nExtract memorable facts as JSON:`;

    // Use the same provider/model as the main agent
    const { provider, model } = context.config;
    const apiKey = context.config.apiKeys[provider as keyof typeof context.config.apiKeys] || "";
    if (!apiKey) return;

    let rawJson = "";

    if (provider === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });
      const resp = await client.messages.create({
        model,
        max_tokens: 800,
        system: REFLECT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });
      rawJson = resp.content.find((b) => b.type === "text")?.text || "[]";
    } else {
      // OpenAI-compatible endpoint
      const { getOpenAICompatibleConfig } = await import("./loop.js") as any;
      // Fallback: skip reflection for non-Anthropic providers in stub mode
      // Full implementation: call OpenAI-compatible chat completions here
      return;
    }

    // Parse and save extracted facts
    const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const facts: ReflectedFact[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(facts) || facts.length === 0) return;

    for (const fact of facts) {
      if (!fact.title || !fact.content || !fact.type) continue;

      // Dedup: skip if a very similar memory already exists
      const existing = await context.memory.search(fact.title, 3);
      const duplicate = existing.some(
        (e) =>
          e.type === fact.type &&
          e.title.toLowerCase() === fact.title.toLowerCase()
      );
      if (duplicate) continue;

      await context.memory.add({
        type: fact.type,
        title: fact.title,
        content: fact.content,
        tags: Array.isArray(fact.tags) ? fact.tags.slice(0, 8) : [],
      });
    }
  } catch {
    // Reflection is best-effort — never crash the main loop
  }
}
