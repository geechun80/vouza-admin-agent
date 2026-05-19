// Browser tools for the Setup Execution Agent (Phase 3)
// All tools require: npm install playwright && npx playwright install chromium

export { browserNavigateTool }    from "./navigate.js";
export { browserClickTool }       from "./click.js";
export { browserFillTool }        from "./fill.js";
export { browserExtractTextTool } from "./extractText.js";
export { browserScreenshotTool }  from "./screenshot.js";
export { browserWaitForTool }     from "./waitFor.js";
export { checkDomainAllowed, getBrowserPage, closeBrowserSession, shutdownBrowser } from "./manager.js";
