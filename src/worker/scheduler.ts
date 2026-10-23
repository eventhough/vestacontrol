// Runs every minute (cron trigger). Sends at most one due note per tick, since
// the board can only show one message and Vestaboard rate-limits writes; any
// other due notes simply go out on the following ticks, in priority order.

import { inQuietHours, nextRun } from "../shared/schedule";
import { NoteRow, Settings, addHistory, getSettings, rowToNote, saveSettings } from "./db";
import type { Env } from "./env";
import { renderContent, WidgetState } from "./render";
import { sendLayout } from "./vestaboard";

/** How late a note may go out before we give up on it (e.g. after an outage). */
const MAX_LATENESS_MS = 30 * 60_000;

export async function runScheduler(env: Env, now = Date.now()): Promise<void> {
  const { results: due } = await env.DB.prepare(
    "SELECT * FROM notes WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at",
  )
    .bind(now)
    .all<NoteRow>();
  if (due.length === 0) return;

  const settings = await getSettings(env);
  // One-time notes take priority over repeating ones; then oldest first.
  due.sort((a, b) => isOnce(a) - isOnce(b) || (a.next_run_at ?? 0) - (b.next_run_at ?? 0));

  let sent = false;
  for (const row of due) {
    const once = isOnce(row) === 0;
    const late = now - (row.next_run_at ?? now) > MAX_LATENESS_MS;
    const quiet = inQuietHours(now, settings.timezone, settings.quietStart, settings.quietEnd);
    const held = settings.holdUntil !== null && settings.holdUntil > now;

    if (late) {
      await finish(env, settings, row, now, once ? "missed" : null, "Skipped: too late (the scheduler was unavailable)");
    } else if (!once && (quiet || held)) {
      await finish(env, settings, row, now, null, quiet ? "Skipped: quiet hours" : "Skipped: another note is being held on the board");
    } else if (!sent) {
      await deliver(env, settings, row, now);
      sent = true;
    }
  }
}

function isOnce(row: NoteRow): 0 | 1 {
  return JSON.parse(row.schedule).type === "once" ? 0 : 1;
}

/** Renders and sends a note right now, then advances its schedule. */
export async function deliver(env: Env, settings: Settings, row: NoteRow, now = Date.now(), advance = true): Promise<{ ok: boolean; error?: string }> {
  const note = rowToNote(row);
  try {
    if (!settings.apiKey) throw new Error("No Vestaboard API key configured.");
    const state = row.state ? (JSON.parse(row.state) as WidgetState) : {};
    const rendered = await renderContent(env, settings, note.content, state, now);
    await sendLayout(settings.apiType, settings.apiKey, rendered.layout, env.VESTABOARD_API_URL);

    await addHistory(env, { noteId: note.id, title: note.title, layout: rendered.layout, status: "sent", author: note.author });
    const nextState = rendered.state ? JSON.stringify(rendered.state) : row.state;
    await env.DB.prepare("UPDATE notes SET state = ?, last_sent_at = ?, last_error = NULL WHERE id = ?").bind(nextState, now, note.id).run();
    // A note can ask to stay up for a while; repeating notes wait until the hold ends.
    await saveSettings(env, { holdUntil: note.holdMinutes > 0 ? now + note.holdMinutes * 60_000 : null });
    if (advance) await finish(env, settings, row, now, "sent", null);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`Failed to send note ${note.id}`, e);
    await addHistory(env, { noteId: note.id, title: note.title, layout: null, status: "failed", detail: error, author: note.author });
    await env.DB.prepare("UPDATE notes SET last_error = ? WHERE id = ?").bind(error, note.id).run();
    if (advance) await finish(env, settings, row, now, "failed", null);
    return { ok: false, error };
  }
}

/**
 * Moves a note past its current run: repeating notes get their next run time,
 * one-time notes are marked done with `onceStatus`.
 */
async function finish(env: Env, settings: Settings, row: NoteRow, now: number, onceStatus: NoteRow["status"] | null, skipReason: string | null) {
  const note = rowToNote(row);
  if (skipReason) {
    await addHistory(env, { noteId: note.id, title: note.title, layout: null, status: "skipped", detail: skipReason, author: note.author });
  }
  if (note.schedule.type === "once") {
    await env.DB.prepare("UPDATE notes SET next_run_at = NULL, status = ?, updated_at = ? WHERE id = ?")
      .bind(onceStatus ?? "missed", now, note.id)
      .run();
  } else {
    const next = nextRun(note.schedule, Math.max(now, row.next_run_at ?? now), settings.timezone);
    await env.DB.prepare("UPDATE notes SET next_run_at = ?, updated_at = ? WHERE id = ?").bind(next, now, note.id).run();
  }
}
