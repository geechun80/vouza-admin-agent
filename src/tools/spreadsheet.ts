// =============================================================================
// Spreadsheet Tool — Google Sheets integration for data entry & reports
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { google } from "googleapis";

// --- Read Spreadsheet ---

export const readSpreadsheetTool = buildTool({
  name: "read_spreadsheet",
  description: "Read data from a Google Sheets spreadsheet. Returns rows as arrays.",
  category: "spreadsheet",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    spreadsheetId: z.string().describe("Google Sheets ID (from the URL)"),
    range: z.string().describe("A1 notation range (e.g., 'Sheet1!A1:D100')"),
  }),
  async call(input, context) {
    try {
      const auth = await getSheetsAuth(context);
      const sheets = google.sheets({ version: "v4", auth });

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: input.spreadsheetId,
        range: input.range,
      });

      const rows = res.data.values || [];
      return {
        success: true,
        data: { rowCount: rows.length, headers: rows[0] || [], rows: rows.slice(1) },
      };
    } catch (err) {
      return { success: false, error: `Failed to read spreadsheet: ${err}` };
    }
  },
});

// --- Write to Spreadsheet ---

export const writeSpreadsheetTool = buildTool({
  name: "write_spreadsheet",
  description: "Write or append data to a Google Sheets spreadsheet.",
  category: "spreadsheet",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    spreadsheetId: z.string(),
    range: z.string().describe("A1 notation range to write to"),
    values: z.array(z.array(z.string())).describe("2D array of values to write"),
    mode: z.enum(["overwrite", "append"]).optional().default("append"),
  }),
  async call(input, context) {
    try {
      const auth = await getSheetsAuth(context);
      const sheets = google.sheets({ version: "v4", auth });

      if (input.mode === "append") {
        const res = await sheets.spreadsheets.values.append({
          spreadsheetId: input.spreadsheetId,
          range: input.range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: input.values },
        });
        return {
          success: true,
          data: { updatedRange: res.data.updates?.updatedRange, updatedRows: res.data.updates?.updatedRows ?? 0, updatedCells: 0 },
        };
      } else {
        const res = await sheets.spreadsheets.values.update({
          spreadsheetId: input.spreadsheetId,
          range: input.range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: input.values },
        });
        return {
          success: true,
          data: { updatedRange: res.data.updatedRange, updatedRows: 0, updatedCells: res.data.updatedCells ?? 0 },
        };
      }
    } catch (err) {
      return { success: false, error: `Failed to write spreadsheet: ${err}` };
    }
  },
});

// --- Search Spreadsheet ---

export const searchSpreadsheetTool = buildTool({
  name: "search_spreadsheet",
  description: "Search for specific values across a spreadsheet and return matching rows.",
  category: "spreadsheet",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    spreadsheetId: z.string(),
    range: z.string(),
    searchTerm: z.string().describe("Text to search for (case-insensitive)"),
    searchColumn: z.number().optional().describe("Column index to search in (0-based). Searches all if omitted."),
  }),
  async call(input, context) {
    try {
      const auth = await getSheetsAuth(context);
      const sheets = google.sheets({ version: "v4", auth });

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: input.spreadsheetId,
        range: input.range,
      });

      const rows = res.data.values || [];
      const headers = rows[0] || [];
      const term = input.searchTerm.toLowerCase();

      const matches = rows.slice(1).filter((row, _idx) => {
        if (input.searchColumn !== undefined) {
          return (row[input.searchColumn] || "").toLowerCase().includes(term);
        }
        return row.some((cell) => (cell || "").toLowerCase().includes(term));
      });

      return {
        success: true,
        data: { headers, matchCount: matches.length, matches },
      };
    } catch (err) {
      return { success: false, error: `Failed to search spreadsheet: ${err}` };
    }
  },
});

async function getSheetsAuth(context: any) {
  const keyPath = context.config.tools.googleServiceAccount;
  if (keyPath) {
    return new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  throw new Error("Google service account not configured");
}
