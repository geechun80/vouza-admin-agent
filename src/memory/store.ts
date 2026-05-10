// =============================================================================
// Memory Store — File-based persistent memory inspired by Claude Code's
// memdir.ts with MEMORY.md index + individual memory files
// =============================================================================

import { readdir, readFile, writeFile, mkdir, unlink } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import type { MemoryEntry, MemoryStore, MemoryType } from "../types/index.js";

const INDEX_FILE = "MEMORY.md";
const MAX_INDEX_LINES = 200;
const MAX_INDEX_BYTES = 25_000;

/**
 * File-based memory store.
 *
 * Architecture (from Claude Code's memdir):
 * - MEMORY.md = index file with one-line pointers
 * - Individual .json files = full memory entries
 * - Index is truncated to prevent token bloat
 * - Entries are searched by keyword matching + recency scoring
 */
export function createMemoryStore(memoryDir: string): MemoryStore {
  const entries = new Map<string, MemoryEntry>();

  return {
    entries,

    async load() {
      await mkdir(memoryDir, { recursive: true });
      entries.clear();

      try {
        const files = await readdir(memoryDir);
        const jsonFiles = files.filter((f) => extname(f) === ".json");

        for (const file of jsonFiles) {
          try {
            const raw = await readFile(join(memoryDir, file), "utf-8");
            const entry: MemoryEntry = JSON.parse(raw);
            entries.set(entry.id, entry);
          } catch {
            // Skip corrupted files
          }
        }
      } catch {
        // Empty directory
      }
    },

    async save() {
      await mkdir(memoryDir, { recursive: true });

      // Save individual entries
      for (const [id, entry] of entries) {
        const filePath = join(memoryDir, `${id}.json`);
        await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
      }

      // Rebuild index
      await rebuildIndex(memoryDir, entries);
    },

    async add(partial) {
      const id = randomUUID().slice(0, 12);
      const now = Date.now();

      const entry: MemoryEntry = {
        id,
        type: partial.type,
        title: partial.title,
        content: partial.content,
        tags: partial.tags,
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
      };

      entries.set(id, entry);

      // Persist immediately
      const filePath = join(memoryDir, `${id}.json`);
      await mkdir(memoryDir, { recursive: true });
      await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
      await rebuildIndex(memoryDir, entries);

      return id;
    },

    async search(query: string, limit = 10) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const scored: Array<{ entry: MemoryEntry; score: number }> = [];

      for (const entry of entries.values()) {
        let score = 0;
        const searchable = `${entry.title} ${entry.content} ${entry.tags.join(" ")}`.toLowerCase();

        // Keyword matching
        for (const term of terms) {
          if (searchable.includes(term)) score += 10;
          if (entry.title.toLowerCase().includes(term)) score += 5; // title bonus
          if (entry.tags.some((t) => t.toLowerCase().includes(term))) score += 3; // tag bonus
        }

        // Recency bonus (decay over 30 days)
        const ageHours = (Date.now() - entry.updatedAt) / 3_600_000;
        const recencyBonus = Math.max(0, 5 - ageHours / (24 * 30) * 5);
        score += recencyBonus;

        // Access frequency bonus
        score += Math.min(entry.accessCount * 0.5, 5);

        // Type-based priority for admin tasks
        if (entry.type === "process") score += 2;
        if (entry.type === "preference") score += 1;

        if (score > 0) {
          scored.push({ entry, score });
        }
      }

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);

      // Update access counts
      const results = scored.slice(0, limit).map((s) => {
        s.entry.accessCount++;
        return s.entry;
      });

      return results;
    },

    async update(id: string, updates: Partial<MemoryEntry>) {
      const entry = entries.get(id);
      if (!entry) return;

      Object.assign(entry, updates, { updatedAt: Date.now() });
      entries.set(id, entry);

      const filePath = join(memoryDir, `${id}.json`);
      await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
      await rebuildIndex(memoryDir, entries);
    },

    async remove(id: string) {
      entries.delete(id);
      try {
        await unlink(join(memoryDir, `${id}.json`));
      } catch {
        // Already gone
      }
      await rebuildIndex(memoryDir, entries);
    },
  };
}

/**
 * Rebuild the MEMORY.md index file.
 * Mirrors Claude Code's truncateEntrypointContent pattern:
 * - Max 200 lines
 * - Max 25KB
 * - One-line pointers sorted by recency
 */
async function rebuildIndex(
  memoryDir: string,
  entries: Map<string, MemoryEntry>
): Promise<void> {
  const sorted = Array.from(entries.values()).sort((a, b) => b.updatedAt - a.updatedAt);

  const lines = [
    "# Admin Agent Memory Index",
    "",
    `> ${sorted.length} memories | Last updated: ${new Date().toISOString()}`,
    "",
  ];

  // Group by type
  const byType = new Map<MemoryType, MemoryEntry[]>();
  for (const entry of sorted) {
    const group = byType.get(entry.type) || [];
    group.push(entry);
    byType.set(entry.type, group);
  }

  for (const [type, typeEntries] of byType) {
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}`);
    for (const entry of typeEntries) {
      const age = formatAge(entry.updatedAt);
      lines.push(`- [${entry.title}](${entry.id}.json) — ${entry.tags.slice(0, 3).join(", ")} (${age})`);
    }
    lines.push("");
  }

  // Truncate to limits (mirrors Claude Code's truncateEntrypointContent)
  let content = lines.join("\n");
  const contentLines = content.split("\n");
  if (contentLines.length > MAX_INDEX_LINES) {
    content = contentLines.slice(0, MAX_INDEX_LINES).join("\n");
  }
  if (content.length > MAX_INDEX_BYTES) {
    const cutAt = content.lastIndexOf("\n", MAX_INDEX_BYTES);
    content = content.slice(0, cutAt > 0 ? cutAt : MAX_INDEX_BYTES);
  }

  await writeFile(join(memoryDir, INDEX_FILE), content, "utf-8");
}

function formatAge(timestamp: number): string {
  const hours = (Date.now() - timestamp) / 3_600_000;
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  if (hours < 720) return `${Math.floor(hours / 24)}d ago`;
  return `${Math.floor(hours / 720)}mo ago`;
}
