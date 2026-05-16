// =============================================================================
// Auto-Skill Writer — Hermes-inspired persistent skill creation
//
// After a successful multi-tool task, analyzes the conversation and writes
// a reusable SKILL.md to data/skills/. Before a task starts, searches
// existing skills and injects matching ones into the system prompt so the
// agent follows proven procedures instead of re-figuring things from scratch.
//
// Flow:
//   1. findRelevantSkills(task)  → injected into system prompt before first call
//   2. autoWriteSkill(messages)  → runs fire-and-forget after session completes
// =============================================================================

import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync }                           from "fs";
import path                                     from "path";
import type { AgentContext, ConversationMessage } from "../types/index.js";

const SKILLS_DIR = path.resolve(process.cwd(), "data", "skills");

// ─── Skill writer system prompt ───────────────────────────────────────────────

const SKILL_WRITER_PROMPT = `You are a skill extraction assistant for an AI office admin agent.
Analyze this completed task conversation and write a reusable SKILL.md document.

Use EXACTLY this format:
---
name: [snake_case_skill_name]
description: [one sentence — what this skill does]
triggers: [comma-separated phrases a user might say to need this skill]
tools: [comma-separated tool names used]
---

## What This Skill Does
[2-3 sentences describing the task this skill handles]

## Step-by-Step Procedure
1. [exact step with tool name if applicable]
2. [exact step]
(continue for all steps)

## Common Pitfalls
- [pitfall encountered and how to avoid it]

## Verification
- [how to confirm the task completed successfully]

Only write a skill if the task was:
1. Multi-step (used 3+ distinct tools)
2. Successfully completed (no unresolved errors)
3. Likely to recur (email setup, report generation, scheduling, etc.)

If the task does NOT qualify, output exactly: SKIP

Output ONLY the skill document or SKIP — no explanation, no preamble.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

async function callAI(
  prompt: string,
  systemPrompt: string,
  context: AgentContext,
  maxTokens = 1200
): Promise<string> {
  const { provider, model } = context.config;
  const apiKey = context.config.apiKeys[provider as keyof typeof context.config.apiKeys] || "";
  if (!apiKey) return "SKIP";

  if (provider === "anthropic") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client    = new Anthropic({ apiKey });
    const resp      = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: "user", content: prompt }],
    });
    return (resp.content.find((b: any) => b.type === "text") as any)?.text ?? "SKIP";
  }

  // OpenAI-compatible (OpenRouter, DeepSeek, xAI, etc.)
  const BASE_URLS: Record<string, string> = {
    openrouter: "https://openrouter.ai/api/v1",
    openai:     "https://api.openai.com/v1",
    deepseek:   "https://api.deepseek.com",
    google:     "https://generativelanguage.googleapis.com/v1beta/openai",
    xai:        "https://api.x.ai/v1",
    alibaba:    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    moonshot:   "https://api.moonshot.cn/v1",
  };
  const baseURL = BASE_URLS[provider] ?? "https://openrouter.ai/api/v1";
  const headers: Record<string, string> = {
    Authorization:  `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://adminagent.app";
    headers["X-Title"]      = "Admin Agent";
  }

  const res = await fetch(`${baseURL}/chat/completions`, {
    method:  "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: prompt },
      ],
    }),
  });
  if (!res.ok) return "SKIP";
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "SKIP";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search existing skill files for any that match the current task.
 * Returns a formatted string ready to inject into the system prompt,
 * or "" if no relevant skills are found.
 */
export async function findRelevantSkills(taskDescription: string): Promise<string> {
  if (!existsSync(SKILLS_DIR)) return "";

  try {
    const files   = await readdir(SKILLS_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    if (mdFiles.length === 0) return "";

    const taskLower = taskDescription.toLowerCase().split(/\s+/);
    const relevant: string[] = [];

    for (const file of mdFiles) {
      try {
        const content      = await readFile(path.join(SKILLS_DIR, file), "utf-8");
        const triggerMatch = content.match(/^triggers:\s*(.+)$/m);
        if (!triggerMatch) continue;

        const triggers = triggerMatch[1].split(",").map((t) => t.trim().toLowerCase());
        // Match if any trigger word appears in the task, or vice-versa
        const isRelevant = triggers.some((trigger) =>
          taskLower.some((word) => word.length > 3 && trigger.includes(word))
        );
        if (isRelevant) relevant.push(content.slice(0, 1500)); // cap size per skill
      } catch {
        continue;
      }
    }

    if (relevant.length === 0) return "";

    return (
      "\n\n## Learned Skills (reuse these proven procedures)\n" +
      "The following skills were learned from past successful tasks. " +
      "Follow their procedures exactly — they already account for pitfalls.\n\n" +
      relevant.join("\n\n---\n\n")
    );
  } catch {
    return "";
  }
}

/**
 * Fire-and-forget: analyze a completed conversation and write a SKILL.md
 * if the task was complex, successful, and likely to recur.
 * Never throws — skill writing is best-effort.
 */
export async function autoWriteSkill(
  messages:   ConversationMessage[],
  toolsUsed:  string[],
  context:    AgentContext
): Promise<void> {
  // Minimum complexity gate: needs 3+ distinct tools to be worth a skill
  const distinctTools = [...new Set(toolsUsed)];
  if (distinctTools.length < 3) return;

  try {
    await mkdir(SKILLS_DIR, { recursive: true });

    // Build a condensed conversation view for the skill writer
    const convoText = messages
      .filter((m) => {
        if (typeof m.content === "string") return m.content.length > 10;
        if (Array.isArray(m.content)) {
          return (m.content as any[]).some(
            (b: any) =>
              (b.type === "text" && b.text?.length > 10) ||
              b.type === "tool_use"
          );
        }
        return false;
      })
      .slice(-24) // last 24 messages
      .map((m) => {
        if (typeof m.content === "string")
          return `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`;

        const parts = (m.content as any[])
          .map((b: any) => {
            if (b.type === "text")        return b.text?.slice(0, 350);
            if (b.type === "tool_use")    return `[TOOL: ${b.name}(${JSON.stringify(b.input).slice(0, 150)})]`;
            if (b.type === "tool_result") return `[RESULT: ${JSON.stringify(b.content).slice(0, 150)}]`;
            return null;
          })
          .filter(Boolean);
        return `${m.role.toUpperCase()}: ${parts.join(" ")}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (convoText.length < 300) return; // too short to extract anything useful

    const prompt =
      `Conversation:\n\n${convoText}\n\n` +
      `Distinct tools used: ${distinctTools.join(", ")}\n\n` +
      `Write a SKILL.md or output SKIP:`;

    const skillContent = await callAI(prompt, SKILL_WRITER_PROMPT, context);
    if (!skillContent || skillContent.trim().startsWith("SKIP")) return;

    // Extract skill name from frontmatter
    const nameMatch = skillContent.match(/^name:\s*(.+)$/m);
    const skillName = nameMatch ? slugify(nameMatch[1].trim()) : `skill_${Date.now()}`;

    // Don't overwrite an existing skill — curator handles merging
    const filePath = path.join(SKILLS_DIR, `${skillName}.md`);
    if (existsSync(filePath)) return;

    await writeFile(filePath, skillContent.trim(), "utf-8");
    console.log(`  ✓ Auto-wrote skill: data/skills/${skillName}.md`);
  } catch {
    // Best-effort — never crash the main loop
  }
}
