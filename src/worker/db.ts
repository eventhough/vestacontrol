import type { BoardType, Layout } from "../shared/characters";
import type { ApiType, Favorite, HistoryEntry, Location, Note, NoteContent, PublicSettings, Schedule } from "../shared/types";
import type { Env } from "./env";

// ---------- settings ----------

export interface Settings {
  passwordHash: string | null;
  sessionSecret: string | null;
  boardType: BoardType;
  boardColor: "black" | "white";
  apiType: ApiType;
  apiKey: string | null;
  timezone: string;
  location: Location | null;
  units: "f" | "c";
  quietStart: string | null;
  quietEnd: string | null;
  holdUntil: number | null;
}

const DEFAULTS: Settings = {
  passwordHash: null,
  sessionSecret: null,
  boardType: "note",
  boardColor: "black",
  apiType: "rw",
  apiKey: null,
  timezone: "America/New_York",
  location: null,
  units: "f",
  quietStart: null,
  quietEnd: null,
  holdUntil: null,
};

export async function getSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s: Record<string, unknown> = { ...DEFAULTS };
  for (const row of results) {
    if (row.key in DEFAULTS) s[row.key] = JSON.parse(row.value);
  }
  return s as unknown as Settings;
}

export async function saveSettings(env: Env, patch: Partial<Settings>): Promise<void> {
  const stmts = Object.entries(patch)
    .filter(([k, v]) => k in DEFAULTS && v !== undefined)
    .map(([k, v]) =>
      env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(
        k,
        JSON.stringify(v),
      ),
    );
  if (stmts.length) await env.DB.batch(stmts);
}

export function publicSettings(s: Settings, env: Env): PublicSettings {
  return {
    boardType: s.boardType,
    boardColor: s.boardColor,
    apiType: s.apiType,
    hasApiKey: !!s.apiKey,
    apiKeyHint: s.apiKey ? `••••${s.apiKey.slice(-4)}` : null,
    timezone: s.timezone,
    location: s.location,
    units: s.units,
    quietStart: s.quietStart,
    quietEnd: s.quietEnd,
    holdUntil: s.holdUntil && s.holdUntil > Date.now() ? s.holdUntil : null,
    aiAvailable: !!env.ANTHROPIC_API_KEY,
  };
}

// ---------- notes ----------

export interface NoteRow {
  id: string;
  title: string | null;
  content: string;
  schedule: string;
  next_run_at: number | null;
  enabled: number;
  status: Note["status"];
  author: string | null;
  hold_minutes: number;
  state: string | null;
  last_sent_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    title: r.title,
    content: JSON.parse(r.content) as NoteContent,
    schedule: JSON.parse(r.schedule) as Schedule,
    nextRunAt: r.next_run_at,
    enabled: r.enabled === 1,
    status: r.status,
    author: r.author,
    holdMinutes: r.hold_minutes,
    lastSentAt: r.last_sent_at,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getNoteRow(env: Env, id: string): Promise<NoteRow | null> {
  return env.DB.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first<NoteRow>();
}

// ---------- history ----------

export async function addHistory(
  env: Env,
  entry: { noteId: string | null; title: string | null; layout: Layout | null; status: HistoryEntry["status"]; detail?: string | null; author?: string | null },
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO history (note_id, title, layout, status, detail, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      entry.noteId,
      entry.title,
      entry.layout ? JSON.stringify(entry.layout) : null,
      entry.status,
      entry.detail ?? null,
      entry.author ?? null,
      Date.now(),
    ),
    // Keep the table small.
    env.DB.prepare("DELETE FROM history WHERE id <= (SELECT id FROM history ORDER BY id DESC LIMIT 1 OFFSET 500)"),
  ]);
}

export async function listHistory(env: Env, limit: number): Promise<HistoryEntry[]> {
  const { results } = await env.DB.prepare("SELECT * FROM history ORDER BY id DESC LIMIT ?").bind(limit).all<{
    id: number;
    note_id: string | null;
    title: string | null;
    layout: string | null;
    status: HistoryEntry["status"];
    detail: string | null;
    author: string | null;
    created_at: number;
  }>();
  return results.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    title: r.title,
    layout: r.layout ? (JSON.parse(r.layout) as Layout) : null,
    status: r.status,
    detail: r.detail,
    author: r.author,
    createdAt: r.created_at,
  }));
}

// ---------- favorites ----------

export async function listFavorites(env: Env): Promise<Favorite[]> {
  const { results } = await env.DB.prepare("SELECT * FROM favorites ORDER BY created_at DESC").all<{
    id: string;
    name: string;
    content: string;
    created_at: number;
  }>();
  return results.map((r) => ({ id: r.id, name: r.name, content: JSON.parse(r.content) as NoteContent, createdAt: r.created_at }));
}
