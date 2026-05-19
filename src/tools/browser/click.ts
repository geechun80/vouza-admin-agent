import { z }           from "zod";
import { buildTool }   from "../registry.js";
import { getBrowserPage } from "./manager.js";

export const browserClickTool = buildTool({
  name: "browser_click",
  description:
    "Click an element on the current page by CSS selector or visible text. " +
    "Use after browser_navigate. Prefer text-based selectors (e.g. 'text=Create API Key') " +
    "over fragile CSS selectors when possible.",
  category: "browser" as any,
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    selector:       z.string().describe(
      "CSS selector OR text selector (prefix with 'text=' e.g. 'text=Create key'). " +
      "Examples: '#create-btn', '.api-key-button', 'text=Generate API Key', 'button:has-text(\"Create\")'",
    ),
    timeoutSeconds: z.number().optional().describe("Max seconds to wait for element (default 10)"),
  }),

  async call(input, context): Promise<any> {
    try {
      const page = await getBrowserPage(context.sessionId);
      // Support both CSS and text= selectors
      const sel = input.selector.startsWith("text=")
        ? input.selector
        : input.selector;
      await page.click(sel, { timeout: (input.timeoutSeconds ?? 10) * 1000 });
      const url = page.url();
      return {
        success: true,
        data: { message: `✅ Clicked "${input.selector}" — now on ${url}` },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Click failed on "${input.selector}": ${e?.message ?? e}. Try browser_extract_text to inspect the page first.`,
      };
    }
  },
});
