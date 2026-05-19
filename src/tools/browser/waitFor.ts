import { z }           from "zod";
import { buildTool }   from "../registry.js";
import { getBrowserPage } from "./manager.js";

export const browserWaitForTool = buildTool({
  name: "browser_wait_for",
  description:
    "Wait for a condition on the current page before proceeding. " +
    "Use after clicks or form submissions that trigger page changes. " +
    "Can wait for: a CSS selector to appear, a URL change, or network idle.",
  category: "browser" as any,
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    condition: z.enum(["selector", "url_contains", "network_idle"]).describe(
      "What to wait for: " +
      "'selector' — wait for a CSS selector to appear, " +
      "'url_contains' — wait until the URL contains a substring (e.g. after redirect), " +
      "'network_idle' — wait for no pending network requests",
    ),
    value: z.string().optional().describe(
      "The selector (for 'selector') or URL substring (for 'url_contains'). Not needed for 'network_idle'.",
    ),
    timeoutSeconds: z.number().optional().describe("Max seconds to wait (default 15)"),
  }),

  async call(input, context): Promise<any> {
    const timeout = (input.timeoutSeconds ?? 15) * 1000;
    try {
      const page = await getBrowserPage(context.sessionId);

      switch (input.condition) {
        case "selector": {
          if (!input.value) return { success: false, error: "value (CSS selector) is required for condition=selector" };
          await page.waitForSelector(input.value, { timeout });
          return { success: true, data: { message: `✅ Selector "${input.value}" appeared`, url: page.url() } };
        }

        case "url_contains": {
          if (!input.value) return { success: false, error: "value (URL substring) is required for condition=url_contains" };
          await page.waitForURL((url: any) => url.href.includes(input.value!), { timeout });
          return { success: true, data: { message: `✅ URL now contains "${input.value}"`, url: page.url() } };
        }

        case "network_idle": {
          await page.waitForLoadState("networkidle", { timeout });
          return { success: true, data: { message: "✅ Network is idle", url: page.url() } };
        }

        default:
          return { success: false, error: "Unknown condition" };
      }
    } catch (e: any) {
      return {
        success: false,
        error: `Wait timed out (${input.timeoutSeconds ?? 15}s): ${input.condition}="${input.value ?? ""}". ${e?.message ?? ""}`,
      };
    }
  },
});
