// Optional Claude integration: writes board-sized content on demand.
// Enabled only when the ANTHROPIC_API_KEY secret is set.

import Anthropic from "@anthropic-ai/sdk";
import { BOARD_SIZES, BoardType } from "../shared/characters";
import type { Env } from "./env";

const SYSTEM = `You write messages for a Vestaboard, a split-flap display in a family's home.
Rules:
- Output ONLY the message text, nothing else: no quotes around it, no explanation.
- Use only these characters: A-Z 0-9 space ! @ # $ ( ) - + & = ; : ' " % , . / ? {symbol}
- The board has {rows} rows of {cols} characters. Put each row on its own line, at most {rows} lines, each at most {cols} characters. Never split a word across lines.
- Short, warm, clever and family-friendly. Abbreviate naturally if needed to fit.`;

// Code 62 is a degree sign on the Flagship and a heart on the Note.
const SYMBOL: Record<BoardType, string> = { flagship: "° (degree sign)", note: "❤ (heart; there is no degree sign)" };

export async function generateBoardText(env: Env, prompt: string, board: BoardType, avoid: string[] = []): Promise<string> {
  const { rows, cols } = BOARD_SIZES[board];
  if (!env.ANTHROPIC_API_KEY) throw new Error("Claude is not configured (ANTHROPIC_API_KEY secret is missing).");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 25_000 });

  const avoidText = avoid.length ? `\n\nDon't repeat any of these recent ones:\n${avoid.join("\n")}` : "";
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM.replaceAll("{rows}", String(rows)).replaceAll("{cols}", String(cols)).replace("{symbol}", SYMBOL[board]),
    messages: [{ role: "user", content: `${prompt}${avoidText}` }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to write that one. Try a different prompt.");
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!text) throw new Error("Claude returned an empty message.");
  return text;
}

export const AI_PROMPTS = {
  quote: "Write a short inspiring or witty quote for today.",
  question: "Write a fun question of the day to spark family conversation at dinner.",
  joke: "Write a short, clean, groan-worthy joke (setup and punchline).",
  fact: "Write a surprising, true fun fact.",
  word: "Pick an interesting, family-friendly English word of the day. Put the word alone on the first line, then a short, plain-language definition on the following line(s).",
} as const;
