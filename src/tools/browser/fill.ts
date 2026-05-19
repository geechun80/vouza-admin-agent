import { z }           from "zod";
import { buildTool }   from "../registry.js";
import { getBrowserPage } from "./manager.js";

export const browserFillTool = buildTool({
  name: "browser_fill",
  description:
    "Type text into a form field on the current page. " +
    "Use after browser_navigate. Clears the field first, then types the value. " +
    "For passwords and API keys, the value is typed but never logged.",
  category: "browser" as any,
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    selector:    z.string().describe("CSS selector for the input field (e.g. '#api-key-input', 'input[name=email]')"),
    value:       z.string().describe("Text to type into the field"),
    pressEnter:  z.boolean().optional().describe("Press Enter after filling (default false)"),
    timeoutSeconds: z.number().optional().describe("Max seconds to wait for element (default 10)"),
  }),

  async call(input, context): Promise<any> {
    try {
      const page = await getBrowserPage(context.sessionId);
      await page.fill(input.selector, input.value, {
        timeout: (input.timeoutSeconds ?? 10) * 1000,
      });
      if (input.pressEnter) {
        await page.press(input.selector, "Enter");
      }
      // Never log the value — just confirm the selector
      return {
        success: true,
        data: { message: `✅ Filled "${input.selector}"${input.pressEnter ? " and pressed Enter" : ""}` },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Fill failed on "${input.selector}": ${e?.message ?? e}`,
      };
    }
  },
});
