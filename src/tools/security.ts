// =============================================================================
// Security Scanner — validates files before the agent processes them
// Blocks dangerous types, oversized files, and suspicious content
// =============================================================================

import { readFile } from "fs/promises";
import { extname, basename } from "path";

// Extensions the agent is allowed to process
const ALLOWED_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".eml", ".msg",
]);

// Extensions that are always blocked regardless of MIME
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".msp",
  ".ps1", ".psm1", ".psd1", ".vbs", ".vbe", ".js", ".jse",
  ".wsf", ".wsh", ".scr", ".dll", ".sys", ".drv",
  ".sh", ".bash", ".zsh", ".fish",
  ".lnk", ".url", ".pif", ".inf",
  ".reg", ".jar", ".class",
]);

// Max file size: 20 MB
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Magic bytes for common executable formats
const DANGEROUS_MAGIC: Array<{ bytes: number[]; label: string }> = [
  { bytes: [0x4d, 0x5a], label: "Windows PE executable (MZ)" },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: "ELF executable" },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: "Java class file" },
  { bytes: [0x50, 0x4b, 0x03, 0x04], label: "" }, // ZIP — needs deeper check for Office macros
];

// Patterns that indicate macro-enabled Office documents
const MACRO_SIGNATURES = [
  Buffer.from("vbaProject.bin"),
  Buffer.from("_VBA_PROJECT"),
  Buffer.from("VBA_STORAGE"),
];

export interface ScanResult {
  safe: boolean;
  fileName: string;
  sizeBytes: number;
  extension: string;
  warnings: string[];
  blocked: boolean;
  blockReason?: string;
}

/**
 * Scan a file path before the agent reads or processes it.
 */
export async function scanFile(filePath: string): Promise<ScanResult> {
  const fileName = basename(filePath);
  const ext = extname(fileName).toLowerCase();
  const warnings: string[] = [];

  // --- 1. Extension check ---
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      safe: false, blocked: true,
      blockReason: `Blocked file type: ${ext} files are not allowed for security reasons.`,
      fileName, sizeBytes: 0, extension: ext, warnings,
    };
  }

  if (!ALLOWED_EXTENSIONS.has(ext) && ext !== "") {
    warnings.push(`Unknown extension ${ext} — processing with caution.`);
  }

  // --- 2. Read file (with size guard) ---
  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch (err) {
    return {
      safe: false, blocked: true,
      blockReason: `Cannot read file: ${String(err)}`,
      fileName, sizeBytes: 0, extension: ext, warnings,
    };
  }

  const sizeBytes = content.length;

  if (sizeBytes > MAX_FILE_BYTES) {
    return {
      safe: false, blocked: true,
      blockReason: `File too large: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds the 20 MB limit.`,
      fileName, sizeBytes, extension: ext, warnings,
    };
  }

  // --- 3. Magic byte check ---
  for (const sig of DANGEROUS_MAGIC) {
    if (sig.label && content.length >= sig.bytes.length) {
      const match = sig.bytes.every((b, i) => content[i] === b);
      if (match) {
        return {
          safe: false, blocked: true,
          blockReason: `Dangerous file detected: ${sig.label} (magic bytes match). File extension may be spoofed.`,
          fileName, sizeBytes, extension: ext, warnings,
        };
      }
    }
  }

  // --- 4. Macro check for Office/ZIP formats ---
  const isOffice = [".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt"].includes(ext);
  if (isOffice) {
    for (const sig of MACRO_SIGNATURES) {
      if (content.includes(sig)) {
        warnings.push(
          "⚠️ Macro content detected (VBA). Macros will not be executed, but treat this file with caution."
        );
        break;
      }
    }
  }

  // --- 5. PDF embedded JavaScript check ---
  if (ext === ".pdf") {
    const pdfText = content.toString("latin1");
    if (pdfText.includes("/JavaScript") || pdfText.includes("/JS ")) {
      warnings.push("⚠️ PDF contains embedded JavaScript. It will be read as text only — no scripts will run.");
    }
    if (pdfText.includes("/EmbeddedFile") || pdfText.includes("/Filespec")) {
      warnings.push("⚠️ PDF contains embedded files.");
    }
  }

  return {
    safe: true,
    blocked: false,
    fileName,
    sizeBytes,
    extension: ext,
    warnings,
  };
}

/**
 * Scan a buffer (e.g. from an HTTP upload) without writing to disk first.
 */
export async function scanBuffer(
  buffer: Buffer,
  originalName: string
): Promise<ScanResult> {
  const ext = extname(originalName).toLowerCase();
  const warnings: string[] = [];

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      safe: false, blocked: true,
      blockReason: `Blocked file type: ${ext} files are not allowed.`,
      fileName: originalName, sizeBytes: buffer.length, extension: ext, warnings,
    };
  }

  if (buffer.length > MAX_FILE_BYTES) {
    return {
      safe: false, blocked: true,
      blockReason: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB exceeds the 20 MB limit.`,
      fileName: originalName, sizeBytes: buffer.length, extension: ext, warnings,
    };
  }

  for (const sig of DANGEROUS_MAGIC) {
    if (sig.label && buffer.length >= sig.bytes.length) {
      const match = sig.bytes.every((b, i) => buffer[i] === b);
      if (match) {
        return {
          safe: false, blocked: true,
          blockReason: `Dangerous file content detected: ${sig.label}.`,
          fileName: originalName, sizeBytes: buffer.length, extension: ext, warnings,
        };
      }
    }
  }

  const isOffice = [".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt"].includes(ext);
  if (isOffice) {
    for (const sig of MACRO_SIGNATURES) {
      if (buffer.includes(sig)) {
        warnings.push("⚠️ Macro content detected. Treat this file with caution.");
        break;
      }
    }
  }

  if (ext === ".pdf") {
    const pdfText = buffer.toString("latin1");
    if (pdfText.includes("/JavaScript") || pdfText.includes("/JS ")) {
      warnings.push("⚠️ PDF contains embedded JavaScript — will be read as text only.");
    }
  }

  return {
    safe: true, blocked: false,
    fileName: originalName, sizeBytes: buffer.length,
    extension: ext, warnings,
  };
}

/**
 * Format a scan result as a human-readable string for the agent to report.
 */
export function formatScanResult(result: ScanResult): string {
  if (result.blocked) {
    return `🚫 File blocked — ${result.blockReason}`;
  }
  const size = result.sizeBytes < 1024
    ? `${result.sizeBytes} B`
    : result.sizeBytes < 1024 * 1024
    ? `${(result.sizeBytes / 1024).toFixed(1)} KB`
    : `${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB`;

  const warn = result.warnings.length > 0
    ? `\n${result.warnings.join("\n")}`
    : "";

  return `✅ File scanned: ${result.fileName} (${size})${warn}`;
}
