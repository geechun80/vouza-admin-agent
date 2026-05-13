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
import { readdir, readFile, writeFile, rename, mkdir, stat } from "fs/promises";
import { join, extname, basename, dirname } from "path";
import { createRequire } from "module";

// CommonJS interop for pdf-parse (no ESM export)
const require = createRequire(import.meta.url);

// ─── Binary format parsers ────────────────────────────────────────────────────

const PDF_EXTS  = new Set([".pdf"]);
const WORD_EXTS = new Set([".docx"]);
const XL_EXTS   = new Set([".xlsx", ".xls", ".ods"]);
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

// ─── read_file ────────────────────────────────────────────────────────────────

export const readFileTool = buildTool({
  name: "read_file",
  description:
    "Read ANY local file — plain text (txt, csv, json, md, log, xml, yaml, html, code files), " +
    "PDF documents, Word documents (.docx), and Excel spreadsheets (.xlsx/.xls/.ods). " +
    "For Excel, returns all rows from the first sheet as structured JSON.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    filePath: z.string().describe("Absolute or relative path to the file"),
    encoding: z.string().optional().default("utf-8").describe("Text encoding (text files only)"),
  }),
  async call(input): Promise<any> {
    try {
      const stats = await stat(input.filePath);
      const ext = extname(input.filePath).toLowerCase();

      // ── PDF ────────────────────────────────────────────────────────────────
      if (PDF_EXTS.has(ext)) {
        const text = await parsePDF(input.filePath);
        return {
          success: true,
          data: {
            format: "pdf",
            filePath: input.filePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            content: text,
            charCount: text.length,
          },
        };
      }

      // ── Word ───────────────────────────────────────────────────────────────
      if (WORD_EXTS.has(ext)) {
        const text = await parseWord(input.filePath);
        return {
          success: true,
          data: {
            format: "docx",
            filePath: input.filePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            content: text,
            charCount: text.length,
          },
        };
      }

      // ── Excel ──────────────────────────────────────────────────────────────
      if (XL_EXTS.has(ext)) {
        const result = await parseExcel(input.filePath);
        return {
          success: true,
          data: {
            format: ext.slice(1),
            filePath: input.filePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            sheets: result.sheets,
            activeSheet: result.activeSheet,
            headers: result.headers,
            rowCount: result.rows.length,
            rows: result.rows,
          },
        };
      }

      // ── Plain text (default) ───────────────────────────────────────────────
      const content = await readFile(input.filePath, input.encoding as BufferEncoding);
      return {
        success: true,
        data: {
          format: ext.slice(1) || "txt",
          filePath: input.filePath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          content,
        },
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
