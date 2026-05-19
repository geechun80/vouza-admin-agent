import { z }           from "zod";
import { buildTool }   from "../registry.js";
import { getBrowserPage } from "./manager.js";

export const browserExtractTextTool = buildTool({
  name: "browser_extract_text",
  description:
    "Extract visible text from the current page or a specific element. " +
    "Use this to read API keys displayed on a page, confirm page content, " +
    "or inspect what elements are present before clicking. " +
    "Returns up to 4000 characters of text.",
  category: "browser" as any,
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    selector: z.string().optional().describe(
      "CSS selector to extract text from (e.g. '.api-key-value', '#result'). " +
      "If omitted, extracts visible text from the entire page body.",
    ),
    maxLength: z.number().optional().describe("Max characters to return (default 4000)"),
  }),

  async call(input, context): Promise<any> {
    try {
      const page   = await getBrowserPage(context.sessionId);
      const max    = input.maxLength ?? 4000;
      let   text: string;

      if (input.selector) {
        // Wait briefly for element
        try {
          await page.waitForSelector(input.selector, { timeout: 5000 });
          text = await page.locator(input.selector).innerText();
        } catch {
          // Element not found — return the page title + URL as a hint
          const title = await page.title();
          return {
            success: false,
            error: `Selector "${input.selector}" not found on page: "${title}" (${page.url()})`,
          };
        }
      } else {
        // Full page visible text (strip scripts/styles)
        text = await page.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          for (const tag of clone.querySelectorAll("script,style,noscript")) tag.remove();
          return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
        });
      }

      const truncated = text.length > max;
      return {
        success: true,
        data: {
          text: text.slice(0, max) + (truncated ? "\n…(truncated)" : ""),
          url:  page.url(),
          length: text.length,
          truncated,
        },
      };
    } catch (e: any) {
      return { success: false, error: `Extract failed: ${e?.message ?? e}` };
    }
  },
});
