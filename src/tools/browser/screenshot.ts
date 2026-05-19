import { z }           from "zod";
import { buildTool }   from "../registry.js";
import { getBrowserPage } from "./manager.js";

export const browserScreenshotTool = buildTool({
  name: "browser_screenshot",
  description:
    "Take a screenshot of the current browser page. " +
    "Returns a base64-encoded PNG image that vision-capable models can see. " +
    "Useful for confirming navigation success, reading rendered values, " +
    "or debugging when other tools can't find expected elements.",
  category: "browser" as any,
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    selector: z.string().optional().describe(
      "CSS selector for a specific element to screenshot. If omitted, captures the full viewport.",
    ),
    fullPage: z.boolean().optional().describe("Capture the full scrollable page (default false)"),
  }),

  async call(input, context): Promise<any> {
    try {
      const page = await getBrowserPage(context.sessionId);
      let   buf: Buffer;

      if (input.selector) {
        const el = await page.$(input.selector);
        if (!el) {
          return { success: false, error: `Element "${input.selector}" not found — try browser_extract_text to inspect the page` };
        }
        buf = await el.screenshot({ type: "png" });
      } else {
        buf = await page.screenshot({ type: "png", fullPage: input.fullPage ?? false });
      }

      const base64 = buf.toString("base64");
      return {
        success:       true,
        _visionBlock:  {
          type:   "image",
          source: { type: "base64", media_type: "image/png", data: base64 },
        },
        data: {
          url:     page.url(),
          title:   await page.title(),
          message: "Screenshot captured — view it above",
        },
      };
    } catch (e: any) {
      return { success: false, error: `Screenshot failed: ${e?.message ?? e}` };
    }
  },
});
