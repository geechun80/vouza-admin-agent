// =============================================================================
// File Manager Tool — Local file organization & document management
//
// Supported formats for read_file / read_document:
//   Text  : .txt .csv .json .md .log .xml .yaml .html .js .ts .py etc.
//   PDF   : .pdf  (via pdf-parse — extracts all text content)
//   Word  : .docx (via mammoth — preserves paragraphs, strips formatting)
//   Excel : .xlsx .xls .ods .csv (via exceljs — returns rows as JSON)
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { readdir, readFile, writeFile, rename, mkdir, stat, unlink, copyFile as fsCopyFile } from "fs/promises";
import { join, extname, basename, dirname } from "path";
import { createRequire } from "module";
import type { VisionContentBlock } from "../types/index.js";
import { scanFile } from "./security.js";

// CommonJS interop for pdf-parse and adm-zip (no ESM export)
const require = createRequire(import.meta.url);

// ─── Binary format parsers ────────────────────────────────────────────────────

const PDF_EXTS   = new Set([".pdf"]);
const WORD_EXTS  = new Set([".docx"]);
const XL_EXTS    = new Set([".xlsx", ".xls", ".ods"]);
const PPTX_EXTS  = new Set([".pptx", ".ppt"]);
// Images that vision-capable models (Claude, GPT-4V, Gemini) can natively understand
const VISION_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
// Images we can describe metadata for but can't send as vision (too exotic)
const IMAGE_EXTS  = new Set([...VISION_EXTS, ".bmp", ".tiff", ".tif", ".svg", ".ico"]);

const MAX_IMAGE_BYTES = 3_500_000; // ~3.5 MB raw → ~4.7 MB base64 (Anthropic limit is 5 MB)
const TEXT_EXTS = new Set([
  ".txt", ".csv", ".json", ".md", ".markdown", ".log",
  ".xml", ".yaml", ".yml", ".html", ".htm", ".js", ".ts",
  ".jsx", ".tsx", ".py", ".rb", ".go", ".java", ".sh",
  ".bash", ".zsh", ".sql", ".toml", ".ini", ".cfg", ".env",
]);

async function parsePDF(filePath: string): Promise<string> {
  const pdfParse = require("pdf-parse");
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text?.trim() || "(no text content extracted)";
}

async function parseWord(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  if (result.messages?.length) {
    // log warnings but don't fail
    result.messages.forEach((m: any) => {
      if (m.type === "error") console.warn("[mammoth]", m.message);
    });
  }
  return result.value?.trim() || "(no text content extracted)";
}

async function parseExcel(
  filePath: string,
  sheetName?: string,
  maxRows?: number
): Promise<{ sheets: string[]; activeSheet: string; headers: string[]; rows: Record<string, unknown>[] }> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();

  const ext = extname(filePath).toLowerCase();
  if (ext === ".csv") {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  const sheet = sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets[0];

  if (!sheet) throw new Error(`Sheet "${sheetName}" not found. Available: ${sheetNames.join(", ")}`);

  const rows: Record<string, unknown>[] = [];
  let headers: string[] = [];
  let isFirstRow = true;

  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (maxRows && rows.length >= maxRows) return;
    const values = (row.values as unknown[]).slice(1); // index 0 is always null in exceljs

    if (isFirstRow) {
      headers = values.map((v) => String(v ?? `Col${rowNum}`));
      isFirstRow = false;
      return;
    }

    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const cell = values[i];
      // Unwrap exceljs rich text / formula objects
      if (cell && typeof cell === "object" && "result" in (cell as any)) {
        obj[h] = (cell as any).result;
      } else if (cell && typeof cell === "object" && "text" in (cell as any)) {
        obj[h] = (cell as any).text;
      } else {
        obj[h] = cell ?? null;
      }
    });
    rows.push(obj);
  });

  return { sheets: sheetNames, activeSheet: sheet.name, headers, rows };
}

async function parsePPTX(filePath: string): Promise<{ slideCount: number; text: string }> {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(filePath);
  const entries: any[] = zip.getEntries();

  // Collect slide XML files sorted by slide number
  const slideEntries = entries
    .filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
    .sort((a: any, b: any) => {
      const numA = parseInt(a.entryName.match(/\d+/)?.[0] ?? "0");
      const numB = parseInt(b.entryName.match(/\d+/)?.[0] ?? "0");
      return numA - numB;
    });

  const allText: string[] = [];

  for (let i = 0; i < slideEntries.length; i++) {
    const xml: string = slideEntries[i].getData().toString("utf-8");
    // Extract text from DrawingML <a:t> tags (where slide text lives)
    const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) ?? [];
    const slideText = matches
      .map((m) => m.replace(/<[^>]*>/g, "").trim())
      .filter(Boolean)
      .join(" ");
    if (slideText) allText.push(`[Slide ${i + 1}] ${slideText}`);
  }

  return {
    slideCount: slideEntries.length,
    text: allText.join("\n\n") || "(no text content found in slides)",
  };
}

async function readImageFile(filePath: string, fileSize: number, ext: string): Promise<{
  data: Record<string, unknown>;
  visionBlock?: VisionContentBlock;
}> {
  const isVisionSupported = VISION_EXTS.has(ext);
  const mediaTypeMap: Record<string, VisionContentBlock["source"]["media_type"]> = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".gif":  "image/gif",
    ".webp": "image/webp",
  };

  const meta: Record<string, unknown> = {
    format: ext.slice(1).toUpperCase(),
    filePath,
    sizeBytes: fileSize,
    sizeMB: (fileSize / 1_048_576).toFixed(2),
    visionSupported: isVisionSupported,
  };

  if (!isVisionSupported) {
    meta.note = `${ext} images cannot be rendered for AI vision. Convert to PNG/JPEG for AI analysis.`;
    return { data: meta };
  }

  if (fileSize > MAX_IMAGE_BYTES) {
    meta.note = `Image is too large (${meta.sizeMB} MB) to send as vision input (limit: ~3.5 MB). ` +
      `Use the chat image upload button instead, or resize the image first.`;
    return { data: meta };
  }

  const buffer = await readFile(filePath);
  const base64  = buffer.toString("base64");
  const mediaType = mediaTypeMap[ext] ?? "image/jpeg";

  meta.note = "Image has been provided to the AI for visual analysis.";

  return {
    data: meta,
    visionBlock: {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64 },
    },
  };
}

// ─── read_file ────────────────────────────────────────────────────────────────

export const readFileTool = buildTool({
  name: "read_file",
  description:
    "Read ANY local file and return its content. Supported formats: " +
    "plain text (.txt .csv .json .md .log .xml .yaml .html and all code files), " +
    "PDF (.pdf), Word (.docx), Excel (.xlsx .xls .ods), " +
    "PowerPoint (.pptx — extracts all slide text), " +
    "and images (.jpg .jpeg .png .gif .webp — sends to AI vision for analysis; " +
    ".bmp .tiff .svg — returns metadata only). " +
    "The format is auto-detected by file extension.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    filePath: z.string().describe("Absolute or relative path to the file"),
    encoding: z.string().optional().default("utf-8").describe("Text encoding (plain text files only)"),
  }),
  async call(input): Promise<any> {
    try {
      // ── Security scan before any parsing ──────────────────────────────────
      const scan = await scanFile(input.filePath);
      if (scan.blocked) {
        return { success: false, error: `File blocked: ${scan.blockReason}` };
      }
      if (scan.warnings.length > 0) {
        console.warn("[readFileTool] Security warnings:", scan.warnings);
      }

      const stats = await stat(input.filePath);
      const ext = extname(input.filePath).toLowerCase();

      // ── PDF ────────────────────────────────────────────────────────────────
      if (PDF_EXTS.has(ext)) {
        const text = await parsePDF(input.filePath);
        return {
          success: true,
          data: { format: "pdf", filePath: input.filePath, size: stats.size,
            modified: stats.mtime.toISOString(), content: text, charCount: text.length },
        };
      }

      // ── Word ───────────────────────────────────────────────────────────────
      if (WORD_EXTS.has(ext)) {
        const text = await parseWord(input.filePath);
        return {
          success: true,
          data: { format: "docx", filePath: input.filePath, size: stats.size,
            modified: stats.mtime.toISOString(), content: text, charCount: text.length },
        };
      }

      // ── Excel ──────────────────────────────────────────────────────────────
      if (XL_EXTS.has(ext)) {
        const result = await parseExcel(input.filePath);
        return {
          success: true,
          data: { format: ext.slice(1), filePath: input.filePath, size: stats.size,
            modified: stats.mtime.toISOString(), sheets: result.sheets,
            activeSheet: result.activeSheet, headers: result.headers,
            rowCount: result.rows.length, rows: result.rows },
        };
      }

      // ── PowerPoint ─────────────────────────────────────────────────────────
      if (PPTX_EXTS.has(ext)) {
        const result = await parsePPTX(input.filePath);
        return {
          success: true,
          data: { format: "pptx", filePath: input.filePath, size: stats.size,
            modified: stats.mtime.toISOString(), slideCount: result.slideCount,
            content: result.text, charCount: result.text.length },
        };
      }

      // ── Images ─────────────────────────────────────────────────────────────
      if (IMAGE_EXTS.has(ext)) {
        const { data, visionBlock } = await readImageFile(input.filePath, stats.size, ext);
        return {
          success: true,
          data: { ...data, modified: stats.mtime.toISOString() },
          _visionBlock: visionBlock,
        };
      }

      // ── Plain text (default) ───────────────────────────────────────────────
      const content = await readFile(input.filePath, input.encoding as BufferEncoding);
      return {
        success: true,
        data: { format: ext.slice(1) || "txt", filePath: input.filePath,
          size: stats.size, modified: stats.mtime.toISOString(), content },
      };
    } catch (err) {
      return { success: false, error: `Failed to read file: ${err}` };
    }
  },
});

// ─── read_excel_file ──────────────────────────────────────────────────────────
// Dedicated tool when the user needs fine-grained Excel control (sheet choice,
// row limits, listing available sheets).

export const readExcelFileTool = buildTool({
  name: "read_excel_file",
  description:
    "Read an Excel, spreadsheet, or CSV file from disk. " +
    "Returns rows as structured JSON. Supports .xlsx, .xls, .ods, and .csv. " +
    "Use this when you need to select a specific sheet or limit the number of rows returned.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    filePath: z.string().describe("Path to the .xlsx / .xls / .ods / .csv file"),
    sheetName: z.string().optional().describe("Sheet name to read (defaults to first sheet)"),
    maxRows: z.number().optional().describe("Maximum number of data rows to return (default: all)"),
    listSheetsOnly: z.boolean().optional().default(false).describe("If true, just return the list of sheet names without reading data"),
  }),
  async call(input): Promise<any> {
    try {
      if (input.listSheetsOnly) {
        const ExcelJS = await import("exceljs");
        const workbook = new ExcelJS.default.Workbook();
        const ext = extname(input.filePath).toLowerCase();
        if (ext === ".csv") {
          await workbook.csv.readFile(input.filePath);
        } else {
          await workbook.xlsx.readFile(input.filePath);
        }
        const sheets = workbook.worksheets.map((ws) => ws.name);
        return { success: true, data: { sheets, count: sheets.length } };
      }

      const result = await parseExcel(input.filePath, input.sheetName, input.maxRows);
      return {
        success: true,
        data: {
          sheets: result.sheets,
          activeSheet: result.activeSheet,
          headers: result.headers,
          rowCount: result.rows.length,
          rows: result.rows,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to read Excel file: ${err}` };
    }
  },
});

// ─── list_files ───────────────────────────────────────────────────────────────

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

// ─── write_file ───────────────────────────────────────────────────────────────

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

// ─── organize_files ───────────────────────────────────────────────────────────

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

// ─── delete_file ──────────────────────────────────────────────────────────────

export const deleteFileTool = buildTool({
  name: "delete_file",
  description: "Permanently delete a file from the local filesystem. Cannot be undone.",
  category: "file",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    filePath: z.string().describe("Absolute path to the file to delete"),
  }),
  async call(input) {
    try {
      await unlink(input.filePath);
      return { success: true, data: { deleted: input.filePath } };
    } catch (err) {
      return { success: false, error: `Failed to delete file: ${err}` };
    }
  },
});

// ─── copy_file ────────────────────────────────────────────────────────────────

export const copyFileTool = buildTool({
  name: "copy_file",
  description: "Copy a file from one path to another. Creates destination directories if needed.",
  category: "file",
  isReadOnly: false,
  isConcurrencySafe: true,
  inputSchema: z.object({
    sourcePath: z.string().describe("Absolute path to the source file"),
    destPath: z.string().describe("Absolute path for the copy destination"),
    overwrite: z.boolean().optional().default(false).describe("Overwrite destination if it exists"),
  }),
  async call(input) {
    try {
      // Check destination exists
      if (!input.overwrite) {
        try {
          await stat(input.destPath);
          return { success: false, error: `Destination already exists: ${input.destPath}. Set overwrite=true to replace it.` };
        } catch { /* doesn't exist — safe to proceed */ }
      }
      await mkdir(dirname(input.destPath), { recursive: true });
      await fsCopyFile(input.sourcePath, input.destPath);
      return { success: true, data: { from: input.sourcePath, to: input.destPath } };
    } catch (err) {
      return { success: false, error: `Failed to copy file: ${err}` };
    }
  },
});

// ─── rename_file ──────────────────────────────────────────────────────────────

export const renameFileTool = buildTool({
  name: "rename_file",
  description: "Rename or move a file to a new path. Can also be used to move files between directories.",
  category: "file",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    oldPath: z.string().describe("Current absolute file path"),
    newPath: z.string().describe("New absolute file path"),
  }),
  async call(input) {
    try {
      await mkdir(dirname(input.newPath), { recursive: true });
      await rename(input.oldPath, input.newPath);
      return { success: true, data: { from: input.oldPath, to: input.newPath } };
    } catch (err) {
      return { success: false, error: `Failed to rename file: ${err}` };
    }
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
