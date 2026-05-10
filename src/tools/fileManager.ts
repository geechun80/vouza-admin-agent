// =============================================================================
// File Manager Tool — Local file organization & document management
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { readdir, readFile, writeFile, rename, mkdir, stat, copyFile, unlink } from "fs/promises";
import { join, extname, basename, dirname } from "path";

// --- List Files ---

export const listFilesTool = buildTool({
  name: "list_files",
  description: "List files in a directory with optional filtering by extension or name pattern.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    directory: z.string().describe("Directory path to list"),
    extension: z.string().optional().describe("Filter by extension (e.g., '.pdf', '.xlsx')"),
    recursive: z.boolean().optional().default(false),
  }),
  async call(input) {
    try {
      const files = await listDir(input.directory, input.recursive ?? false, input.extension);
      return { success: true, data: { count: files.length, files } };
    } catch (err) {
      return { success: false, error: `Failed to list files: ${err}` };
    }
  },
});

// --- Read File ---

export const readFileTool = buildTool({
  name: "read_file",
  description: "Read the contents of a text file (txt, csv, json, md, etc).",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    filePath: z.string(),
    encoding: z.string().optional().default("utf-8"),
  }),
  async call(input) {
    try {
      const content = await readFile(input.filePath, input.encoding as BufferEncoding);
      const stats = await stat(input.filePath);
      return {
        success: true,
        data: {
          content,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          extension: extname(input.filePath),
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to read file: ${err}` };
    }
  },
});

// --- Write File ---

export const writeFileTool = buildTool({
  name: "write_file",
  description: "Write content to a file. Creates parent directories if needed.",
  category: "file",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    filePath: z.string(),
    content: z.string(),
    encoding: z.string().optional().default("utf-8"),
  }),
  async call(input) {
    try {
      await mkdir(dirname(input.filePath), { recursive: true });
      await writeFile(input.filePath, input.content, input.encoding as BufferEncoding);
      return { success: true, data: { filePath: input.filePath, bytesWritten: input.content.length } };
    } catch (err) {
      return { success: false, error: `Failed to write file: ${err}` };
    }
  },
});

// --- Organize Files ---

export const organizeFilesTool = buildTool({
  name: "organize_files",
  description:
    "Move and organize files into categorized folders based on type, date, or custom rules.",
  category: "file",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    sourceDir: z.string(),
    rules: z.array(
      z.object({
        pattern: z.string().describe("File extension or name pattern (e.g., '*.pdf', 'invoice*')"),
        targetDir: z.string().describe("Destination directory"),
      })
    ),
    dryRun: z.boolean().optional().default(true).describe("If true, only report what would happen"),
  }),
  async call(input) {
    try {
      const files = await listDir(input.sourceDir, false);
      const actions: Array<{ file: string; from: string; to: string }> = [];

      for (const file of files) {
        for (const rule of input.rules) {
          if (matchPattern(file.name, rule.pattern)) {
            const dest = join(rule.targetDir, file.name);
            actions.push({ file: file.name, from: file.path, to: dest });
            break;
          }
        }
      }

      if (!input.dryRun) {
        for (const action of actions) {
          await mkdir(dirname(action.to), { recursive: true });
          await rename(action.from, action.to);
        }
      }

      return {
        success: true,
        data: { dryRun: input.dryRun, moveCount: actions.length, actions },
      };
    } catch (err) {
      return { success: false, error: `Failed to organize files: ${err}` };
    }
  },
});

// --- Helpers ---

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  isDirectory: boolean;
}

async function listDir(dir: string, recursive: boolean, ext?: string): Promise<FileInfo[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: FileInfo[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...(await listDir(fullPath, true, ext)));
    } else if (entry.isFile()) {
      if (ext && extname(entry.name).toLowerCase() !== ext.toLowerCase()) continue;
      const stats = await stat(fullPath);
      results.push({
        name: entry.name,
        path: fullPath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        isDirectory: false,
      });
    }
  }
  return results;
}

function matchPattern(filename: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    return filename.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
  }
  if (pattern.endsWith("*")) {
    return filename.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase());
  }
  return filename.toLowerCase().includes(pattern.toLowerCase());
}
