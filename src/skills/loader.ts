// =============================================================================
// Skill Loader — Markdown-based skill system inspired by Claude Code's
// loadSkillsDir.ts with frontmatter parsing and lazy loading
// =============================================================================

import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";
import matter from "gray-matter";
import type { SkillDefinition } from "../types/index.js";

// SECURITY NOTE (GHSA-h67p-54hq-rp68 — js-yaml merge-key quadratic DoS, moderate):
// gray-matter@4.0.3 pins js-yaml@3.x, which carries this advisory. We intentionally
// do NOT "fix" it because:
//   • The only YAML this app parses is front-matter in trusted, bundled skill files
//     under ./src/skills/bundled (shipped with the app, never user-uploaded). There
//     is no path — including Phase 1 folder grants / read_pdf / search_local_files —
//     by which an attacker-controlled .md reaches gray-matter, so the DoS has no
//     real attack surface here.
//   • `npm audit fix --force` downgrades gray-matter 4.x → 2.0.1 (feature loss), and
//     overriding js-yaml to 4.x breaks gray-matter (it calls yaml.safeLoad/safeDump,
//     both removed in js-yaml 4). Neither is worth it for a non-exploitable moderate.
// Revisit if skill loading ever accepts untrusted .md input.

/**
 * Load all skills from a directory of markdown files.
 * Each .md file = one skill with YAML frontmatter for metadata.
 *
 * Mirrors Claude Code's pattern:
 * - Frontmatter parsed first (cheap)
 * - Full content loaded on demand (lazy)
 * - Deduplication via file identity
 */
export async function loadSkills(skillsDir: string): Promise<Map<string, SkillDefinition>> {
  const skills = new Map<string, SkillDefinition>();
  const seen = new Set<string>(); // dedup by resolved name

  try {
    const files = await readdir(skillsDir);
    const mdFiles = files.filter((f) => extname(f) === ".md");

    for (const file of mdFiles) {
      const filePath = join(skillsDir, file);
      const raw = await readFile(filePath, "utf-8");
      const parsed = matter(raw);

      const fm = parsed.data;
      const name = fm.name || file.replace(".md", "");

      if (seen.has(name)) continue;
      seen.add(name);

      const skill: SkillDefinition = {
        name,
        displayName: fm.displayName || name,
        description: fm.description || "",
        whenToUse: fm.whenToUse || "",
        category: fm.category || "general",
        prompt: parsed.content.trim(),
        allowedTools: fm.allowedTools || [],
        selfImproveHooks: fm.selfImproveHooks || {
          learnFrom: true,
        },
      };

      skills.set(name, skill);
    }
  } catch (err) {
    console.error(`Failed to load skills from ${skillsDir}:`, err);
  }

  return skills;
}

/**
 * Generate the skills summary for the system prompt.
 * Only includes name + whenToUse (cheap tokens).
 */
export function skillsSummaryForPrompt(skills: Map<string, SkillDefinition>): string {
  if (skills.size === 0) return "";

  const lines = Array.from(skills.values()).map(
    (s) => `- **${s.displayName}**: ${s.whenToUse || s.description}`
  );

  return `\n\n## Available Skills\n${lines.join("\n")}`;
}

/**
 * Create a new skill from experience and save to disk.
 * This is how the self-improvement engine generates new skills.
 */
export async function createSkill(
  skillsDir: string,
  skill: SkillDefinition
): Promise<string> {
  const frontmatter = {
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    whenToUse: skill.whenToUse,
    category: skill.category,
    allowedTools: skill.allowedTools,
    selfImproveHooks: skill.selfImproveHooks,
  };

  const content = matter.stringify(skill.prompt, frontmatter);
  const filePath = join(skillsDir, `${skill.name}.md`);

  const { writeFile: write } = await import("fs/promises");
  await write(filePath, content, "utf-8");

  return filePath;
}

/**
 * Update an existing skill's prompt or metadata.
 */
export async function updateSkill(
  skillsDir: string,
  name: string,
  updates: Partial<SkillDefinition>
): Promise<void> {
  const filePath = join(skillsDir, `${name}.md`);
  const raw = await readFile(filePath, "utf-8");
  const parsed = matter(raw);

  // Merge updates into frontmatter
  const fm = { ...parsed.data, ...updates };
  delete (fm as any).prompt; // prompt goes in content body

  const newContent = updates.prompt || parsed.content.trim();
  const output = matter.stringify(newContent, fm);

  const { writeFile: write } = await import("fs/promises");
  await write(filePath, output, "utf-8");
}
