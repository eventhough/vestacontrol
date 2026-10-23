import { Context, Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { nextRun, runsBetween } from "../shared/schedule";
import { MIN_PASSWORD_LENGTH, type Note, type TimelineItem } from "../shared/types";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, hashPassword, randomHex, verifyPassword, verifySessionToken } from "./auth";
import { NoteRow, addHistory, getNoteRow, getSettings, listFavorites, listHistory, publicSettings, rowToNote, saveSettings } from "./db";
import type { Env } from "./env";
import { RenderError, renderContent } from "./render";
import { clearFailures, clientKey, describeWait, lockedFor, recordFailure } from "./throttle";
import { deliver, runScheduler } from "./scheduler";
import { ValidationError, validateContent, validateNoteInput, validateSettings } from "./validate";
import { VestaboardError, readLayout, sendLayout } from "./vestaboard";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", secureHeaders(), async (c, next) => {
  await next();
  // API responses contain household data; never let a browser or proxy cache them.
  c.header("Cache-Control", "no-store");
});

app.onError((err, c) => {
  if (err instanceof ValidationError || err instanceof RenderError) return c.json({ error: err.message }, 400);
  if (err instanceof VestaboardError) return c.json({ error: err.message }, 502);
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

async function json<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}

function setSession(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

const PASSWORD_TOO_SHORT = `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters. A few random words works well.`;

function tooManyAttempts(c: Context, waitMs: number) {
  c.header("Retry-After", String(Math.ceil(waitMs / 1000)));
  return c.json({ error: `Too many wrong passwords from this device. Try again in ${describeWait(waitMs)}.` }, 429);
}

// ---------- public: setup & login ----------

app.get("/status", async (c) => {
  const s = await getSettings(c.env);
  const authenticated = await verifySessionToken(getCookie(c, SESSION_COOKIE), s.sessionSecret);
  return c.json({ setupComplete: !!s.passwordHash, authenticated });
});

app.post("/setup", async (c) => {
  const s = await getSettings(c.env);
  if (s.passwordHash) return c.json({ error: "Vestacontrol is already set up." }, 409);
  const body = await json<{ password?: string } & Record<string, unknown>>(c.req.raw);
  if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) throw new ValidationError(PASSWORD_TOO_SHORT);
  const update = validateSettings(body);
  const sessionSecret = randomHex(32);
  await saveSettings(c.env, { ...update, passwordHash: await hashPassword(body.password), sessionSecret });
  setSession(c, await createSessionToken(sessionSecret));
  return c.json({ ok: true });
});

app.post("/login", async (c) => {
  const s = await getSettings(c.env);
  if (!s.passwordHash || !s.sessionSecret) return c.json({ error: "Not set up yet." }, 409);
  const client = clientKey(c.req.raw);
  const wait = await lockedFor(c.env, client);
  if (wait) return tooManyAttempts(c, wait);

  const { password } = await json<{ password?: string }>(c.req.raw);
  if (typeof password !== "string" || !(await verifyPassword(password, s.passwordHash))) {
    const lock = await recordFailure(c.env, client);
    return lock ? tooManyAttempts(c, lock) : c.json({ error: "Wrong password." }, 401);
  }
  await clearFailures(c.env, client);
  setSession(c, await createSessionToken(s.sessionSecret));
  return c.json({ ok: true });
});

app.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// ---------- everything below requires the household password ----------

app.use("*", async (c, next) => {
  const s = await getSettings(c.env);
  if (!(await verifySessionToken(getCookie(c, SESSION_COOKIE), s.sessionSecret))) return c.json({ error: "Please sign in." }, 401);
  await next();
});

// ---------- settings ----------

app.get("/settings", async (c) => c.json(publicSettings(await getSettings(c.env), c.env)));

app.put("/settings", async (c) => {
  const update = validateSettings(await json(c.req.raw));
  await saveSettings(c.env, update);
  // Timezone changes shift every repeating note's wall-clock times.
  if (update.timezone) await recomputeAll(c.env);
  return c.json(publicSettings(await getSettings(c.env), c.env));
});

app.post("/settings/password", async (c) => {
  const s = await getSettings(c.env);
  const client = clientKey(c.req.raw);
  const wait = await lockedFor(c.env, client);
  if (wait) return tooManyAttempts(c, wait);
  const { current, next } = await json<{ current?: string; next?: string }>(c.req.raw);
  if (typeof current !== "string" || !(await verifyPassword(current, s.passwordHash!))) {
    const lock = await recordFailure(c.env, client);
    return lock ? tooManyAttempts(c, lock) : c.json({ error: "Current password is wrong." }, 401);
  }
  if (typeof next !== "string" || next.length < MIN_PASSWORD_LENGTH) throw new ValidationError(PASSWORD_TOO_SHORT);
  await clearFailures(c.env, client);
  const sessionSecret = randomHex(32);
  await saveSettings(c.env, { passwordHash: await hashPassword(next), sessionSecret });
  setSession(c, await createSessionToken(sessionSecret));
  return c.json({ ok: true });
});

app.post("/hold/clear", async (c) => {
  await saveSettings(c.env, { holdUntil: null });
  return c.json({ ok: true });
});

app.get("/geocode", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ results: [] });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`);
  if (!res.ok) return c.json({ error: "Location search is unavailable right now." }, 502);
  const data = (await res.json()) as { results?: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number; timezone?: string }[] };
  return c.json({
    results: (data.results ?? []).map((r) => ({
      name: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone,
    })),
  });
});

// ---------- board ----------

app.post("/board/test", async (c) => {
  const s = await getSettings(c.env);
  const body = await json<{ apiType?: "rw" | "cloud"; apiKey?: string }>(c.req.raw);
  const apiType = body.apiType ?? s.apiType;
  const apiKey = body.apiKey?.trim() || s.apiKey;
  if (!apiKey) throw new ValidationError("Enter an API key first.");
  const layout = await readLayout(apiType, apiKey, c.env.VESTABOARD_API_URL);
  return c.json({ ok: true, layout });
});

app.get("/board/current", async (c) => {
  const s = await getSettings(c.env);
  if (!s.apiKey) return c.json({ layout: null });
  return c.json({ layout: await readLayout(s.apiType, s.apiKey, c.env.VESTABOARD_API_URL) });
});

app.post("/preview", async (c) => {
  const s = await getSettings(c.env);
  const { content } = await json<{ content?: unknown }>(c.req.raw);
  const rendered = await renderContent(c.env, s, validateContent(content));
  return c.json({ layout: rendered.layout, text: rendered.text ?? null });
});

app.post("/send", async (c) => {
  const s = await getSettings(c.env);
  if (!s.apiKey) throw new ValidationError("Connect your Vestaboard in Settings first.");
  const body = await json<{ content?: unknown; author?: string; title?: string; holdMinutes?: number }>(c.req.raw);
  const rendered = await renderContent(c.env, s, validateContent(body.content));
  await sendLayout(s.apiType, s.apiKey, rendered.layout, c.env.VESTABOARD_API_URL);
  const hold = Number.isInteger(body.holdMinutes) && body.holdMinutes! > 0 ? Math.min(body.holdMinutes!, 1440) : 0;
  await saveSettings(c.env, { holdUntil: hold ? Date.now() + hold * 60_000 : null });
  await addHistory(c.env, { noteId: null, title: body.title ?? "Sent now", layout: rendered.layout, status: "sent", author: body.author?.slice(0, 40) ?? null });
  return c.json({ ok: true, layout: rendered.layout });
});

// ---------- notes ----------

async function computeNext(env: Env, schedule: Note["schedule"]): Promise<number | null> {
  const s = await getSettings(env);
  // Allow a one-time note scheduled for "right now" (within the last minute) to still go out.
  return nextRun(schedule, Date.now() - (schedule.type === "once" ? 60_000 : 0), s.timezone);
}

async function recomputeAll(env: Env) {
  const s = await getSettings(env);
  const { results } = await env.DB.prepare("SELECT * FROM notes WHERE enabled = 1").all<NoteRow>();
  const now = Date.now();
  const stmts = results
    .map(rowToNote)
    .filter((n) => n.schedule.type === "recurring")
    .map((n) => env.DB.prepare("UPDATE notes SET next_run_at = ? WHERE id = ?").bind(nextRun(n.schedule, now, s.timezone), n.id));
  if (stmts.length) await env.DB.batch(stmts);
}

app.get("/notes", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM notes ORDER BY created_at DESC LIMIT 500").all<NoteRow>();
  return c.json({ notes: results.map(rowToNote) });
});

app.get("/notes/:id", async (c) => {
  const row = await getNoteRow(c.env, c.req.param("id"));
  return row ? c.json({ note: rowToNote(row) }) : c.json({ error: "Note not found" }, 404);
});

app.post("/notes", async (c) => {
  const input = validateNoteInput(await json(c.req.raw));
  const next = await computeNext(c.env, input.schedule);
  if (next === null) throw new ValidationError(input.schedule.type === "once" ? "That time is in the past." : "That schedule never runs.");
  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO notes (id, title, content, schedule, next_run_at, enabled, status, author, hold_minutes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`,
  )
    .bind(id, input.title, JSON.stringify(input.content), JSON.stringify(input.schedule), next, input.enabled ? 1 : 0, input.author, input.holdMinutes, now, now)
    .run();
  return c.json({ note: rowToNote((await getNoteRow(c.env, id))!) }, 201);
});

app.put("/notes/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await getNoteRow(c.env, id);
  if (!existing) return c.json({ error: "Note not found" }, 404);
  const input = validateNoteInput(await json(c.req.raw));
  const next = await computeNext(c.env, input.schedule);
  if (next === null && input.enabled) throw new ValidationError(input.schedule.type === "once" ? "That time is in the past." : "That schedule never runs.");
  await c.env.DB.prepare(
    `UPDATE notes SET title = ?, content = ?, schedule = ?, next_run_at = ?, enabled = ?, status = 'scheduled',
       author = ?, hold_minutes = ?, last_error = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(input.title, JSON.stringify(input.content), JSON.stringify(input.schedule), next, input.enabled ? 1 : 0, input.author, input.holdMinutes, Date.now(), id)
    .run();
  return c.json({ note: rowToNote((await getNoteRow(c.env, id))!) });
});

app.patch("/notes/:id/enabled", async (c) => {
  const id = c.req.param("id");
  const row = await getNoteRow(c.env, id);
  if (!row) return c.json({ error: "Note not found" }, 404);
  const { enabled } = await json<{ enabled?: boolean }>(c.req.raw);
  const note = rowToNote(row);
  const next = enabled ? await computeNext(c.env, note.schedule) : row.next_run_at;
  await c.env.DB.prepare("UPDATE notes SET enabled = ?, next_run_at = ?, updated_at = ? WHERE id = ?").bind(enabled ? 1 : 0, next, Date.now(), id).run();
  return c.json({ note: rowToNote((await getNoteRow(c.env, id))!) });
});

app.delete("/notes/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

app.post("/notes/:id/send", async (c) => {
  const row = await getNoteRow(c.env, c.req.param("id"));
  if (!row) return c.json({ error: "Note not found" }, 404);
  const result = await deliver(c.env, await getSettings(c.env), row, Date.now(), false);
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, 502);
});

app.get("/timeline", async (c) => {
  const s = await getSettings(c.env);
  const days = Math.min(Math.max(Number(c.req.query("days")) || 14, 1), 60);
  const now = Date.now();
  const until = now + days * 86_400_000;
  const { results } = await c.env.DB.prepare("SELECT * FROM notes WHERE enabled = 1 AND next_run_at IS NOT NULL").all<NoteRow>();
  const notes = results.map(rowToNote);
  const items: TimelineItem[] = [];
  for (const n of notes) {
    if (n.schedule.type === "once") {
      if (n.nextRunAt! <= until) items.push({ noteId: n.id, at: n.nextRunAt!, recurring: false });
    } else {
      // Start from the stored next run so an overdue occurrence still shows.
      const first = n.nextRunAt!;
      if (first <= until) items.push({ noteId: n.id, at: first, recurring: true });
      for (const at of runsBetween(n.schedule, first, until, s.timezone, 60)) items.push({ noteId: n.id, at, recurring: true });
    }
  }
  items.sort((a, b) => a.at - b.at);
  return c.json({ items: items.slice(0, 400), notes });
});

app.get("/history", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  return c.json({ history: await listHistory(c.env, limit) });
});

// ---------- favorites ----------

app.get("/favorites", async (c) => c.json({ favorites: await listFavorites(c.env) }));

app.post("/favorites", async (c) => {
  const body = await json<{ name?: string; content?: unknown }>(c.req.raw);
  const name = (body.name ?? "").trim().slice(0, 60);
  if (!name) throw new ValidationError("Give your favorite a name.");
  const content = validateContent(body.content);
  await c.env.DB.prepare("INSERT INTO favorites (id, name, content, created_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), name, JSON.stringify(content), Date.now())
    .run();
  return c.json({ favorites: await listFavorites(c.env) }, 201);
});

app.delete("/favorites/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM favorites WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ favorites: await listFavorites(c.env) });
});

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduler(env));
  },
} satisfies ExportedHandler<Env>;
