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

/** How many past answers per prompt Claude is told to avoid repeating. */
const MEMORY_SIZE = 15;

export interface GenerateOptions {
  /** Extra answers to avoid (e.g. a note's own recent ones). */
  avoid?: string[];
  /** Extra instruction for this attempt only; not part of the remembered prompt. */
  hint?: string;
}

/**
 * Asks Claude for board-sized text. Past answers to the same prompt are remembered
 * in the database (shared by previews, "send now" and scheduled notes), so asking
 * again gives something new instead of Claude's single most likely answer.
 */
export async function generateBoardText(env: Env, prompt: string, board: BoardType, options: GenerateOptions = {}): Promise<string> {
  const { rows, cols } = BOARD_SIZES[board];
  if (!env.ANTHROPIC_API_KEY) throw new Error("Claude is not configured (ANTHROPIC_API_KEY secret is missing).");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 25_000 });

  const key = await memoryKey(prompt);
  const remembered = await loadMemory(env, key);
  const avoid = [...new Set([...remembered, ...(options.avoid ?? [])])].slice(0, MEMORY_SIZE);

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM.replaceAll("{rows}", String(rows)).replaceAll("{cols}", String(cols)).replace("{symbol}", SYMBOL[board]),
    messages: [{ role: "user", content: buildUserMessage(prompt, avoid, options.hint) }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to write that one. Try a different prompt.");
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!text) throw new Error("Claude returned an empty message.");
  await saveMemory(env, key, [text, ...remembered.filter((t) => t !== text)].slice(0, MEMORY_SIZE));
  return text;
}

export function buildUserMessage(prompt: string, avoid: string[], hint?: string, seed = Math.floor(Math.random() * 10_000)): string {
  const parts = [prompt];
  if (hint) parts.push(hint);
  if (avoid.length) parts.push(`You've already written these, so write something clearly different (not a rewording):\n${avoid.join("\n---\n")}`);
  parts.push(`Variation #${seed}: skip the first idea that comes to mind and pick something less obvious.`);
  return parts.join("\n\n");
}

// ---------- memory of past answers, kept in the settings table ----------

async function memoryKey(prompt: string): Promise<string> {
  const normalized = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `aiRecent:${hex.slice(0, 32)}`;
}

async function loadMemory(env: Env, key: string): Promise<string[]> {
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
    const list = row ? JSON.parse(row.value) : [];
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

async function saveMemory(env: Env, key: string, list: string[]): Promise<void> {
  try {
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(key, JSON.stringify(list))
      .run();
  } catch (e) {
    console.warn("Could not save Claude's answer history", e);
  }
}

export const AI_PROMPTS = {
  quote: "Write a short inspiring or witty quote for today.",
  question: "Write a fun question of the day to spark family conversation at dinner.",
  joke: "Write a short, clean, groan-worthy joke (setup and punchline).",
  fact: "Write a surprising, true fun fact.",
  word: "Pick an interesting, family-friendly English word of the day. Put the word alone on the first line, then a short, plain-language definition on the following line(s).",
} as const;
