// =============================================================================
// Skill Generator — Auto-creates new skills from patterns in execution history
// The core self-improvement capability: learning by doing
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, MemoryStore, SkillDefinition, ImprovementAction } from "../types/index.js";
import { createSkill, loadSkills, updateSkill } from "../skills/loader.js";

/**
 * Generate a new skill from an improvement action.
 * Uses Claude to write the skill definition based on observed patterns.
 */
export async function generateSkill(
  action: ImprovementAction,
  memory: MemoryStore,
  config: AgentConfig
): Promise<SkillDefinition | null> {
  const client = new Anthropic({ apiKey: config.apiKeys.anthropic });

  // Gather context from memory about what the agent has learned
  const relevantMemories = await memory.search(action.description, 15);
  const memoryContext = relevantMemories
    .map((m) => `- [${m.type}] ${m.title}: ${m.content}`)
    .join("\n");

  const prompt = `You are a skill designer for an AI admin assistant agent.

## Context
The agent has identified a need for a new skill based on this analysis:

**Action**: ${action.description}
**Priority**: ${action.priority}
**Data**: ${JSON.stringify(action.data, null, 2)}

## Relevant Memories
${memoryContext}

## Available Tools
- read_emails, send_email, draft_email, triage_emails
- list_calendar_events, create_calendar_event, update_calendar_event, find_free_slots
- read_spreadsheet, write_spreadsheet, search_spreadsheet
- send_slack_message, read_slack_messages, list_slack_channels
- list_files, read_file, write_file, organize_files

## Task
Generate a skill definition in this EXACT format:

\`\`\`yaml
name: skill-name-kebab-case
displayName: Human Readable Name
description: One-line description of what this skill does
whenToUse: When should the agent use this skill
category: email|calendar|data-entry|messaging|file-management|general
allowedTools:
  - tool_name_1
  - tool_name_2
selfImproveHooks:
  learnFrom: true
  onSuccess: "What to remember on success"
  onFailure: "What to remember on failure"
\`\`\`

Then write the skill prompt (workflow steps, rules, learning notes) as markdown.

The skill should be:
1. Specific and actionable (not generic)
2. Based on real patterns from the execution history
3. Include learning notes for future self-improvement
4. Reference specific tools by their exact names

Return ONLY the YAML frontmatter block and the markdown content. No other text.`;

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return parseGeneratedSkill(text);
  } catch (err) {
    console.error("Skill generation failed:", err);
    return null;
  }
}

/**
 * Improve an existing skill based on performance feedback.
 */
export async function improveSkill(
  skillName: string,
  feedback: string,
  memory: MemoryStore,
  config: AgentConfig
): Promise<boolean> {
  const skills = await loadSkills(config.skillsDir);
  const skill = skills.get(skillName);
  if (!skill) return false;

  const client = new Anthropic({ apiKey: config.apiKeys.anthropic });

  const relevantMemories = await memory.search(`${skillName} ${feedback}`, 10);

  const prompt = `You are improving an existing skill for an AI admin assistant.

## Current Skill: ${skill.displayName}
\`\`\`
${skill.prompt}
\`\`\`

## Feedback / Issue
${feedback}

## Relevant Memories
${relevantMemories.map((m) => `- ${m.title}: ${m.content}`).join("\n")}

## Task
Rewrite the skill prompt with improvements that address the feedback.
Keep the same structure but:
1. Fix the identified issues
2. Add guardrails to prevent the problem recurring
3. Update the "Learning Notes" section with the new insight
4. Preserve everything that was working well

Return ONLY the improved markdown prompt content (no frontmatter).`;

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const newPrompt = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    await updateSkill(config.skillsDir, skillName, { prompt: newPrompt.trim() });

    // Log the improvement in memory
    await memory.add({
      type: "learned_skill",
      title: `skill_improved:${skillName}`,
      content: `Improved skill "${skillName}" based on feedback: ${feedback.slice(0, 200)}`,
      tags: ["self-improve", "skill-update", skillName],
    });

    return true;
  } catch (err) {
    console.error(`Failed to improve skill ${skillName}:`, err);
    return false;
  }
}

/**
 * Save a generated skill to disk and register it.
 */
export async function saveGeneratedSkill(
  skill: SkillDefinition,
  config: AgentConfig,
  memory: MemoryStore
): Promise<string> {
  const filePath = await createSkill(config.skillsDir, skill);

  // Log the creation in memory
  await memory.add({
    type: "learned_skill",
    title: `skill_created:${skill.name}`,
    content: `Auto-generated skill "${skill.displayName}": ${skill.description}. Tools: [${skill.allowedTools.join(", ")}]`,
    tags: ["self-improve", "skill-create", skill.name, skill.category],
  });

  return filePath;
}

// --- Parser ---

function parseGeneratedSkill(raw: string): SkillDefinition | null {
  try {
    // Extract YAML block
    const yamlMatch = raw.match(/```yaml\n([\s\S]*?)```/);
    if (!yamlMatch) return null;

    const yaml = yamlMatch[1];
    const lines = yaml.split("\n");
    const fm: Record<string, any> = {};
    let currentArray: string[] | null = null;
    let currentKey = "";

    for (const line of lines) {
      const kvMatch = line.match(/^(\w+):\s*(.+)/);
      const arrayItemMatch = line.match(/^\s+-\s+(.+)/);
      const nestedKvMatch = line.match(/^\s+(\w+):\s*(.+)/);

      if (kvMatch && !line.startsWith(" ")) {
        currentKey = kvMatch[1];
        const val = kvMatch[2].trim();
        if (val) {
          fm[currentKey] = val === "true" ? true : val === "false" ? false : val;
        }
        currentArray = null;
      } else if (arrayItemMatch && currentKey) {
        if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
        fm[currentKey].push(arrayItemMatch[1].trim());
      } else if (nestedKvMatch && currentKey) {
        if (typeof fm[currentKey] !== "object" || Array.isArray(fm[currentKey])) {
          fm[currentKey] = {};
        }
        const val = nestedKvMatch[2].trim().replace(/^["']|["']$/g, "");
        fm[currentKey][nestedKvMatch[1]] = val === "true" ? true : val === "false" ? false : val;
      }
    }

    // Extract markdown content after YAML block
    const afterYaml = raw.slice(raw.indexOf("```", yamlMatch.index! + 3) + 3).trim();
    // Remove any trailing code fence
    const prompt = afterYaml.replace(/```\s*$/, "").trim();

    if (!fm.name || !prompt) return null;

    return {
      name: fm.name,
      displayName: fm.displayName || fm.name,
      description: fm.description || "",
      whenToUse: fm.whenToUse || "",
      category: fm.category || "general",
      prompt,
      allowedTools: fm.allowedTools || [],
      selfImproveHooks: fm.selfImproveHooks || { learnFrom: true },
    };
  } catch {
    return null;
  }
}
