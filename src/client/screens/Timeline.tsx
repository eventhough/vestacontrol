import { useCallback, useEffect, useMemo, useState } from "react";
import type { Layout } from "../../shared/characters";
import { formatTime12, utcToLocalDate, utcToLocalTime } from "../../shared/schedule";
import type { Note, TimelineItem } from "../../shared/types";
import { WIDGETS } from "../../shared/types";
import { api } from "../api";
import { Board } from "../components/Board";
import { NotePreview, contentSummary } from "../components/NotePreview";
import { Empty, Switch } from "../components/ui";
import { errorMessage, navigate, useApp } from "../state";

export function dayLabel(date: string, tz: string): string {
  const today = utcToLocalDate(Date.now(), tz);
  const tomorrow = utcToLocalDate(Date.now() + 86_400_000, tz);
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

export function Timeline() {
  const { settings, toast, refreshSettings } = useApp();
  const tz = settings.timezone;
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [current, setCurrent] = useState<{ layout?: Layout | null; error?: string; loading?: boolean }>({ loading: true });
  const [showRepeats, setShowRepeats] = useState(() => {
    try {
      return localStorage.getItem("vc_show_repeats") !== "0";
    } catch {
      return true;
    }
  });

  const loadBoard = useCallback(async () => {
    if (!settings.hasApiKey) return setCurrent({});
    setCurrent((c) => ({ ...c, loading: true }));
    try {
      setCurrent({ layout: (await api.currentBoard()).layout });
    } catch (e) {
      setCurrent({ error: errorMessage(e) });
    }
  }, [settings.hasApiKey]);

  const loadTimeline = useCallback(async () => {
    try {
      const r = await api.timeline(14);
      setItems(r.items);
      setNotes(Object.fromEntries(r.notes.map((n) => [n.id, n])));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }, [toast]);

  useEffect(() => {
    void loadBoard();
    void loadTimeline();
  }, [loadBoard, loadTimeline]);

  const groups = useMemo(() => {
    const out: { date: string; items: TimelineItem[] }[] = [];
    const weekAhead = Date.now() + 7 * 86_400_000;
    for (const it of items ?? []) {
      if (it.recurring && (!showRepeats || it.at > weekAhead)) continue;
      const date = utcToLocalDate(it.at, tz);
      if (out.at(-1)?.date !== date) out.push({ date, items: [] });
      out.at(-1)!.items.push(it);
    }
    return out;
  }, [items, showRepeats, tz]);

  const releaseHold = async () => {
    await api.clearHold();
    await refreshSettings();
    toast("Repeating notes can run again");
  };

  return (
    <div className="stack-lg">
      <section className="stack-sm">
        <div className="row between">
          <h2>On the board now</h2>
          {settings.hasApiKey && (
            <button className="btn btn-ghost btn-sm" onClick={loadBoard} disabled={current.loading} aria-label="Refresh">
              ↻
            </button>
          )}
        </div>
        {!settings.hasApiKey ? (
          <p className="warn">
            Connect your Vestaboard in <a href="#/settings">Settings</a> to start sending notes.
          </p>
        ) : current.layout ? (
          <Board layout={current.layout} color={settings.boardColor} />
        ) : current.error ? (
          <p className="error">{current.error}</p>
        ) : (
          <div className="board-skeleton" />
        )}
        {settings.holdUntil && (
          <div className="banner row between">
            <span>📌 Held on the board until {formatTime12(utcToLocalTime(settings.holdUntil, tz))}</span>
            <button className="btn btn-ghost btn-sm" onClick={releaseHold}>
              Release
            </button>
          </div>
        )}
      </section>

      <section className="stack">
        <div className="row between">
          <h2>Coming up</h2>
          <label className="row small muted">
            Show repeating
            <Switch
              checked={showRepeats}
              label="Show repeating notes"
              onChange={(v) => {
                setShowRepeats(v);
                try {
                  localStorage.setItem("vc_show_repeats", v ? "1" : "0");
                } catch {
                  // ignore
                }
              }}
            />
          </label>
        </div>

        {items === null ? (
          <p className="muted">Loading…</p>
        ) : groups.length === 0 ? (
          <Empty icon="🗓️" title="Nothing scheduled">
            <p className="muted">Plan a note for later, or set up a daily quote or weather forecast.</p>
            <a className="btn btn-primary" href="#/compose">
              + New note
            </a>
          </Empty>
        ) : (
          groups.map((g) => (
            <div key={g.date} className="day-group">
              <h3 className="day-heading">{dayLabel(g.date, tz)}</h3>
              <ul className="timeline">
                {g.items.map((it) => {
                  const n = notes[it.noteId];
                  if (!n) return null;
                  const open = () => navigate({ name: "compose", id: n.id });
                  if (it.recurring) {
                    return (
                      <li key={`${it.noteId}-${it.at}`}>
                        <button className="tl-item tl-compact" onClick={open}>
                          <div className="tl-time">{formatTime12(utcToLocalTime(it.at, tz))}</div>
                          <div className="tl-title">
                            {n.content.type === "widget" ? `${WIDGETS[n.content.widget].icon} ` : "🔁 "}
                            {n.title || contentSummary(n.content)}
                          </div>
                          {n.lastError && <span className="error small">!</span>}
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={`${it.noteId}-${it.at}`}>
                      <button className="tl-item" onClick={open}>
                        <div className="tl-time">{formatTime12(utcToLocalTime(it.at, tz))}</div>
                        <div className="tl-body">
                          <div className="tl-title">{n.title || contentSummary(n.content)}</div>
                          <NotePreview content={n.content} board={settings.boardType} boardColor={settings.boardColor} />
                          <div className="tl-meta muted small">
                            {n.author ? `From ${n.author}` : "One time"}
                            {n.lastError ? <span className="error"> · last send failed</span> : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
