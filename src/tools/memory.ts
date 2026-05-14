// =============================================================================
// Memory Tool — lets the agent explicitly save facts during conversations
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import type { MemoryType } from "../types/index.js";

export const saveMemoryTool = buildTool({
  name: "save_memory",
  description:
    "Save an important fact, preference, contact detail, or process to long-term memory. " +
    "Use this whenever the user reveals something worth remembering: their preferences, " +
    "contacts, how they like things done, or recurring patterns. " +
    "Examples: 'User prefers PDF reports', 'Boss is John Smith john@acme.com', " +
    "'Weekly status report sent every Monday 9am'.",
  category: "memory",
  isReadOnly: false,
  inputSchema: z.object({
    type: z
      .enum(["contact", "process", "preference", "feedback", "pattern"])
      .describe("Memory type: contact=people/companies, process=how things are done, preference=user likes/dislikes, feedback=corrections, pattern=recurring behaviour"),
    title: z.string().max(80).describe("Short descriptive title, e.g. 'Boss contact details' or 'Report format preference'"),
    content: z
      .string()
      .max(2000)
      .describe("Full details to remember. Be specific and factual."),
    tags: z
      .array(z.string().max(30))
      .max(8)
      .describe("Keywords for retrieval, e.g. ['email', 'boss', 'john']"),
  }),
  call: async (input, context) => {
    const id = await context.memory.add({
      type: input.type as MemoryType,
      title: input.title,
      content: input.content,
      tags: input.tags,
    });

    return {
      success: true,
      data: { id, message: `Remembered: "${input.title}"` },
    };
  },
});

export const searchMemoryTool = buildTool({
  name: "search_memory",
  description:
    "Search long-term memory for relevant facts, contacts, preferences, or processes. " +
    "Use before starting a task to recall relevant context.",
  category: "memory",
  isReadOnly: true,
  inputSchema: z.object({
    query: z.string().describe("What to search for, e.g. 'boss email' or 'report format'"),
    limit: z.number().min(1).max(20).default(5).describe("Max results to return"),
  }),
  call: async (input, context): Promise<any> => {
    const results = await context.memory.search(input.query, input.limit);

    if (results.length === 0) {
      return { success: true, data: { results: [], message: "No memories found." } };
    }

    return {
      success: true,
      data: {
        results: results.map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          content: e.content,
          tags: e.tags,
          updatedAt: new Date(e.updatedAt).toISOString(),
        })),
      },
    };
  },
});

export const updateMemoryTool = buildTool({
  name: "update_memory",
  description: "Update an existing memory entry by ID — edit its content, title, or tags in place.",
  category: "memory",
  isReadOnly: false,
  inputSchema: z.object({
    id: z.string().describe("Memory ID to update"),
    title: z.string().max(80).optional().describe("New title (leave blank to keep current)"),
    content: z.string().max(2000).optional().describe("New content (leave blank to keep current)"),
    tags: z.array(z.string().max(30)).max(8).optional().describe("Replacement tag list"),
  }),
  call: async (input, context) => {
    const exists = context.memory.entries.get(input.id);
    if (!exists) {
      return { success: false, error: `Memory ${input.id} not found.` };
    }
    const updates: Record<string, unknown> = {};
    if (input.title)   updates.title   = input.title;
    if (input.content) updates.content = input.content;
    if (input.tags)    updates.tags    = input.tags;
    await context.memory.update(input.id, updates);
    return { success: true, data: { id: input.id, updated: Object.keys(updates), message: `Updated: "${input.title || exists.title}"` } };
  },
});

export const listAllMemoriesTool = buildTool({
  name: "list_all_memories",
  description: "List all saved memories with their IDs, titles, types, and tags. Use to audit what the agent knows.",
  category: "memory",
  isReadOnly: true,
  inputSchema: z.object({
    type: z.enum(["contact", "process", "preference", "feedback", "pattern"]).optional()
      .describe("Filter by memory type (leave blank for all)"),
  }),
  call: async (input, context) => {
    let entries = [...context.memory.entries.values()];
    if (input.type) entries = entries.filter(e => e.type === input.type);
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    const list = entries.map(e => ({
      id: e.id, type: e.type, title: e.title, tags: e.tags,
      accessCount: e.accessCount, updatedAt: new Date(e.updatedAt).toISOString(),
    }));
    return { success: true, data: { count: list.length, memories: list } };
  },
});

export const forgetMemoryTool = buildTool({
  name: "forget_memory",
  description:
    "Delete a specific memory by ID. Use when the user says something is outdated or wrong.",
  category: "memory",
  isReadOnly: false,
  inputSchema: z.object({
    id: z.string().describe("Memory ID to delete"),
    reason: z.string().optional().describe("Why it's being removed"),
  }),
  call: async (input, context) => {
    const exists = context.memory.entries.get(input.id);
    if (!exists) {
      return { success: false, error: `Memory ${input.id} not found.` };
    }
    await context.memory.remove(input.id);
    return { success: true, data: { message: `Forgot: "${exists.title}"` } };
  },
});
