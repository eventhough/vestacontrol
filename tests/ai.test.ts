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

import { buildUserMessage, generateBoardText } from "../src/worker/ai";
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
});
