// =============================================================================
// Smoke tests — buildInlineKeyboard (telegram/listener.ts)
//
// This is one of the Hermes-inspired UX improvements (v0.14.0). Regressing
// here means users on mobile lose the tappable buttons and have to type
// numbers to choose options.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildInlineKeyboard } from "../src/telegram/listener.js";

describe("buildInlineKeyboard — happy path", () => {
  it("builds buttons for a 3-option numbered list with dots", () => {
    const text = `Please choose:
1. Option Alpha
2. Option Beta
3. Option Gamma`;
    const kb = buildInlineKeyboard(text);
    assert.ok(kb);
    assert.equal(kb!.inline_keyboard.length, 3);
    assert.equal(kb!.inline_keyboard[0][0].text, "Option Alpha");
    assert.equal(kb!.inline_keyboard[2][0].text, "Option Gamma");
  });

  it("builds buttons for a numbered list with parentheses (1) 2) ...)", () => {
    const text = `Pick one:
1) First
2) Second
3) Third`;
    const kb = buildInlineKeyboard(text);
    assert.ok(kb);
    assert.equal(kb!.inline_keyboard.length, 3);
  });

  it("strips Markdown formatting from labels", () => {
    const text = `1. **Bold option**
2. _italic option_
3. \`code option\``;
    const kb = buildInlineKeyboard(text);
    assert.ok(kb);
    assert.equal(kb!.inline_keyboard[0][0].text, "Bold option");
    assert.equal(kb!.inline_keyboard[1][0].text, "italic option");
    assert.equal(kb!.inline_keyboard[2][0].text, "code option");
  });
});

describe("buildInlineKeyboard — boundary cases", () => {
  it("returns undefined for a single-option list (not a choice)", () => {
    const text = "1. Only one option";
    assert.equal(buildInlineKeyboard(text), undefined);
  });

  it("returns undefined for >5 options (too many for Telegram UX)", () => {
    const text = `Many options:
1. One
2. Two
3. Three
4. Four
5. Five
6. Six`;
    assert.equal(buildInlineKeyboard(text), undefined);
  });

  it("returns undefined when no numbered list present", () => {
    const text = "Just a normal reply with no choices to make.";
    assert.equal(buildInlineKeyboard(text), undefined);
  });

  it("accepts exactly 2 options (minimum)", () => {
    const text = `1. Yes
2. No`;
    const kb = buildInlineKeyboard(text);
    assert.ok(kb);
    assert.equal(kb!.inline_keyboard.length, 2);
  });

  it("accepts exactly 5 options (maximum)", () => {
    const text = `1. A
2. B
3. C
4. D
5. E`;
    const kb = buildInlineKeyboard(text);
    assert.ok(kb);
    assert.equal(kb!.inline_keyboard.length, 5);
  });

  it("truncates labels longer than 64 chars (Telegram limit)", () => {
    const long = "x".repeat(100);
    const text = `1. ${long}
2. Short`;
    const kb = buildInlineKeyboard(text);
    assert.ok(kb);
    assert.ok(kb!.inline_keyboard[0][0].text.length <= 64);
    assert.ok(kb!.inline_keyboard[0][0].callback_data.length <= 64);
  });

  it("ignores empty labels (e.g., '1. ' with no content)", () => {
    const text = `1.
2. Real option
3. Another real`;
    const kb = buildInlineKeyboard(text);
    // Either undefined (filtered to 2) or 2 buttons — both acceptable
    if (kb) {
      assert.ok(kb.inline_keyboard.every((row) => row[0].text.length > 0));
    }
  });
});

describe("buildInlineKeyboard — interleaved with prose", () => {
  it("picks up numbered choices embedded in a longer message", () => {
    const text = `Sure! Here are your options for tonight's dinner:

1. Pasta carbonara
2. Chicken curry
3. Sushi platter

Just tap one to confirm.`;
    const kb = buildInlineKeyboard(text);
    assert.ok(kb);
    assert.equal(kb!.inline_keyboard.length, 3);
  });
});
