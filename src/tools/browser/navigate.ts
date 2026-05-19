import { z }                  from "zod";
import { buildTool }           from "../registry.js";
import { getBrowserPage, checkDomainAllowed } from "./manager.js";

export const browserNavigateTool = buildTool({
  name: "browser_navigate",
  description:
    "Navigate the browser to a URL and return the page title and current URL. " +
    "Only allowlisted domains are reachable (Google, Slack, Telegram, Groq, OpenAI, etc.). " +
    "Use this to open provider dashboards before using browser_click or browser_fill.",
  category: "browser" as any,
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    url:            z.string().describe("The full URL to navigate to (must be https://)"),
    waitUntil:      z.enum(["load", "domcontentloaded", "networkidle"]).optional()
                    .describe("When to consider navigation done (default: domcontentloaded)"),
    timeoutSeconds: z.number().optional().describe("Max seconds to wait (default 30)"),
  }),

  async call(input, context): Promise<any> {
    const guard = checkDomainAllowed(input.url);
    if (!guard.allowed) {
      return { success: false, error: guard.reason };
    }
    try {
      const page = await getBrowserPage(context.sessionId);
      await page.goto(input.url, {
        waitUntil: input.waitUntil ?? "domcontentloaded",
        timeout:   (input.timeoutSeconds ?? 30) * 1000,
      });
      const title = await page.title();
      const url   = page.url();
      return {
        success: true,
        data: {
          title,
          url,
          message: `✅ Navigated to: ${title} (${url})`,
        },
      };
    } catch (e: any) {
      return { success: false, error: `Navigation failed: ${e?.message ?? e}` };
    }
  },
});
