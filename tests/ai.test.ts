import { beforeEach, describe, expect, it, vi } from "vitest";

// Each call to Claude returns the next canned answer and records the message it was sent.
const sent: string[] = [];
let answers: string[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: async (req: { messages: { content: string }[] }) => {
          sent.push(req.messages[0].content);
          return { stop_reason: "end_turn", content: [{ type: "text", text: answers.shift() ?? "FALLBACK" }] };
        },
      },
    };
  },
}));

import { buildUserMessage, generateBoardText, sameText } from "../src/worker/ai";
import { JOKES } from "../src/worker/content";
import type { Settings } from "../src/worker/db";
import { renderContent } from "../src/worker/render";
import type { Env } from "../src/worker/env";

/** Just enough of D1 for the settings table. */
function fakeEnv(): Env {
  const rows = new Map<string, string>();
  const DB = {
    prepare: (sql: string) => ({
      bind: (...args: string[]) => ({
        first: async () => (rows.has(args[0]) ? { value: rows.get(args[0]) } : null),
        run: async () => {
          if (sql.startsWith("INSERT")) rows.set(args[0], args[1]);
          return {};
        },
      }),
    }),
  };
  return { DB, ANTHROPIC_API_KEY: "test" } as unknown as Env;
}

describe("Claude answers", () => {
  beforeEach(() => {
    sent.length = 0;
    answers = [];
  });

  it("remembers past answers to the same prompt, even without a note's own state", async () => {
    const env = fakeEnv();
    answers = ["FIRST JOKE", "SECOND JOKE", "THIRD JOKE"];
    await generateBoardText(env, "Tell a joke", "note");
    await generateBoardText(env, "  tell a JOKE ", "note");
    await generateBoardText(env, "Tell a joke", "note");

    expect(sent[0]).not.toContain("already written");
    expect(sent[1]).toContain("FIRST JOKE");
    expect(sent[2]).toContain("FIRST JOKE");
    expect(sent[2]).toContain("SECOND JOKE");
  });

  it("keeps separate memories for different prompts", async () => {
    const env = fakeEnv();
    answers = ["A JOKE", "A FACT"];
    await generateBoardText(env, "Tell a joke", "note");
    await generateBoardText(env, "Tell a fact", "note");
    expect(sent[1]).not.toContain("A JOKE");
  });

  it("varies the request each time and keeps one-off hints out of the prompt", () => {
    expect(buildUserMessage("Hi", [], undefined, 1)).not.toBe(buildUserMessage("Hi", [], undefined, 2));
    const msg = buildUserMessage("Hi", ["OLD"], "Keep it shorter", 7);
    expect(msg).toMatch(/^Hi\n\nKeep it shorter\n\n.*OLD/s);
  });

  it("asks again when Claude repeats a remembered answer word for word", async () => {
    const env = fakeEnv();
    answers = ["WHY DID THE CHICKEN", "why did the chicken?", "A NEW ONE"];
    await generateBoardText(env, "Tell a joke", "note");
    const second = await generateBoardText(env, "Tell a joke", "note");
    expect(second).toBe("A NEW ONE");
    expect(sent).toHaveLength(3);
    expect(sent[2]).toContain("already used this one");
  });

  it("remembers about a year of answers but only shows Claude the most recent 30", async () => {
    const env = fakeEnv();
    answers = Array.from({ length: 400 }, (_, i) => `JOKE ${i}`);
    for (let i = 0; i < 400; i++) await generateBoardText(env, "Tell a joke", "note");
    const last = sent[sent.length - 1];
    expect(last).toContain("JOKE 398");
    expect(last).not.toContain("JOKE 300\n");
    expect((last.match(/\n---\n/g) ?? []).length).toBe(29);
  });
});

describe("sameText", () => {
  it("ignores case, punctuation and line breaks", () => {
    expect(sameText("Why did the\nchicken?")).toBe(sameText("WHY DID THE CHICKEN"));
    expect(sameText("A joke")).not.toBe(sameText("Another joke"));
  });
});

describe("built-in lists", () => {
  it("share one place per type across notes, previews and sends", async () => {
    const env = fakeEnv();
    const settings = { boardType: "flagship", timezone: "America/New_York" } as Settings;
    const joke = { type: "widget" as const, widget: "joke" as const, config: {} };
    const mix = { type: "widget" as const, widget: "mix" as const, config: { kinds: ["joke" as const] } };
    // Two different notes, each starting with no state of their own.
    const a = await renderContent(env, settings, joke, {});
    const b = await renderContent(env, settings, mix, {});
    const c = await renderContent(env, settings, joke, {});
    expect([a.text, b.text, c.text]).toEqual([JOKES[0], JOKES[1], JOKES[2]]);
  });
});
