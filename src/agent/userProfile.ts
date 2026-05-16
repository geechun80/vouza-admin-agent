// =============================================================================
// User Profile Modelling — builds a persistent understanding of who the user is
//
// Reads accumulated memory facts (saved by autoReflect after each session) and
// synthesises them into a compact profile block injected into every system prompt.
// This makes the agent feel like it genuinely knows the user from day one, not
// like it resets after every conversation.
//
// The profile grows automatically — no user action required:
//   Session 1: user mentions their name → autoReflect saves it → profile includes it
//   Session 5: user corrects a preference → autoReflect updates it → profile reflects it
//
// Design principles:
//   • Read-only: never writes to memory itself (autoReflect does the writing)
//   • Compact: max ~200 tokens so it doesn't eat into the context budget
//   • Graceful: returns "" if no profile data exists yet (new users)
// =============================================================================

import type { MemoryStore, MemoryEntry } from "../types/index.js";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a compact user profile string for injection into the system prompt.
 *
 * Returns "" for new users with no memory yet (silent — never crashes).
 * Returns a formatted block once memory facts have been accumulated.
 */
export async function buildProfileContext(memory: MemoryStore): Promise<string> {
  try {
    // Pull facts across the three most profile-relevant memory types
    const [contactFacts, prefFacts, patternFacts] = await Promise.all([
      memory.search("user name role company email timezone person who", 6),
      memory.search("prefers prefer preference format style tone timing", 5),
      memory.search("recurring schedule weekly daily pattern habit routine", 3),
    ]);

    // Deduplicate by id across the three queries
    const seen = new Set<string>();
    const allFacts: MemoryEntry[] = [];
    for (const fact of [...contactFacts, ...prefFacts, ...patternFacts]) {
      if (!seen.has(fact.id)) {
        seen.add(fact.id);
        allFacts.push(fact);
      }
    }

    // Skip performance logs — they're internal and not user-profile data
    const profileFacts = allFacts.filter(
      (m) =>
        !m.title.startsWith("perf_log:") &&
        !m.tags.includes("performance") &&
        m.type !== "learned_skill"
    );

    if (profileFacts.length === 0) return "";

    // Group by type for organised display
    const contacts    = profileFacts.filter((m) => m.type === "contact");
    const preferences = profileFacts.filter((m) => m.type === "preference");
    const patterns    = profileFacts.filter((m) => m.type === "pattern");
    const feedback    = profileFacts.filter((m) => m.type === "feedback");

    const lines: string[] = [];

    if (contacts.length > 0) {
      lines.push(
        "**Identity:**\n" +
        contacts
          .slice(0, 3)
          .map((m) => `  - ${m.content.slice(0, 150)}`)
          .join("\n")
      );
    }

    if (preferences.length > 0) {
      lines.push(
        "**Preferences:**\n" +
        preferences
          .slice(0, 4)
          .map((m) => `  - ${m.content.slice(0, 120)}`)
          .join("\n")
      );
    }

    if (patterns.length > 0) {
      lines.push(
        "**Recurring patterns:**\n" +
        patterns
          .slice(0, 2)
          .map((m) => `  - ${m.content.slice(0, 120)}`)
          .join("\n")
      );
    }

    if (feedback.length > 0) {
      lines.push(
        "**Previous corrections:**\n" +
        feedback
          .slice(0, 2)
          .map((m) => `  - ${m.content.slice(0, 120)}`)
          .join("\n")
      );
    }

    if (lines.length === 0) return "";

    return (
      "\n\n## 👤 User Profile (learned from past sessions)\n" +
      "Use these facts to personalise every response — address the user by name, " +
      "respect their stated preferences, and reference known patterns proactively:\n\n" +
      lines.join("\n\n") +
      "\n"
    );
  } catch {
    // Profile is best-effort — never block the agent loop
    return "";
  }
}
