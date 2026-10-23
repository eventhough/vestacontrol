import { useCallback, useEffect, useState } from "react";
import { describeSchedule, formatTime12, utcToLocalDate, utcToLocalTime } from "../../shared/schedule";
import type { Note, NoteInput } from "../../shared/types";
import { WIDGETS } from "../../shared/types";
import { api } from "../api";
import { NotePreview, contentSummary } from "../components/NotePreview";
import { Empty, Switch } from "../components/ui";
import { errorMessage, navigate, useApp } from "../state";
import { dayLabel } from "./Timeline";

const IDEAS: { label: string; input: NoteInput; needs?: "location" | "ai" }[] = [
  {
    label: "Weather every morning at 7",
    needs: "location",
    input: { title: "Morning weather", content: { type: "widget", widget: "weather", config: {} }, schedule: { type: "recurring", days: [], times: ["07:00"] } },
  },
  {
    label: "Quote of the day at 8",
    input: { title: "Quote of the day", content: { type: "widget", widget: "quote", config: {} }, schedule: { type: "recurring", days: [], times: ["08:00"] } },
  },
  {
    label: "Dinner question at 5:30",
    input: { title: "Question of the day", content: { type: "widget", widget: "question", config: {} }, schedule: { type: "recurring", days: [], times: ["17:30"] } },
  },
  {
    label: "Good morning + date at 6:30",
    input: { title: "Good morning", content: { type: "widget", widget: "date", config: {} }, schedule: { type: "recurring", days: [], times: ["06:30"] } },
  },
  {
    label: "Weekend joke at 9",
    input: { title: "Weekend joke", content: { type: "widget", widget: "joke", config: {} }, schedule: { type: "recurring", days: [0, 6], times: ["09:00"] } },
  },
  {
    label: "Fun fact after school",
    input: { title: "Fun fact", content: { type: "widget", widget: "fact", config: {} }, schedule: { type: "recurring", days: [1, 2, 3, 4, 5], times: ["15:30"] } },
  },
];

export function Repeats() {
  const { settings, size, toast } = useApp();
  const [notes, setNotes] = useState<Note[] | null>(null);

  const load = useCallback(async () => {
    try {
      const { notes } = await api.notes();
      setNotes(notes.filter((n) => n.schedule.type === "recurring"));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (n: Note, enabled: boolean) => {
    setNotes((list) => list?.map((x) => (x.id === n.id ? { ...x, enabled } : x)) ?? null);
    try {
      await api.setEnabled(n.id, enabled);
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
      await load();
    }
  };

  const addIdea = async (input: NoteInput) => {
    try {
      await api.createNote(input);
      toast("Added!");
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const ideas = IDEAS.filter((i) => i.needs !== "location" || settings.location);

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1>Repeating notes</h1>
        <a className="btn btn-primary btn-sm" href="#/compose/repeat">
          + New
        </a>
      </div>

      {notes === null ? (
        <p className="muted">Loading…</p>
      ) : notes.length === 0 ? (
        <Empty icon="🔁" title="No repeating notes yet">
          <p className="muted">Repeating notes run on a schedule — like a daily weather report or a question of the day.</p>
        </Empty>
      ) : (
        <ul className="cards">
          {notes.map((n) => (
            <li key={n.id} className={`card repeat-card${n.enabled ? "" : " disabled"}`}>
              <div className="row between">
                <button className="link-btn" onClick={() => navigate({ name: "compose", id: n.id })}>
                  <strong>
                    {n.content.type === "widget" ? `${WIDGETS[n.content.widget].icon} ` : ""}
                    {n.title || contentSummary(n.content)}
                  </strong>
                </button>
                <Switch checked={n.enabled} onChange={(v) => toggle(n, v)} label={`${n.enabled ? "Pause" : "Resume"} ${n.title ?? "note"}`} />
              </div>
              <button className="link-btn stack-sm" onClick={() => navigate({ name: "compose", id: n.id })}>
                <NotePreview content={n.content} size={size} boardColor={settings.boardColor} />
                <span className="muted small">
                  {describeSchedule(n.schedule)}
                  {n.enabled && n.nextRunAt
                    ? ` · next ${dayLabel(utcToLocalDate(n.nextRunAt, settings.timezone), settings.timezone).toLowerCase()} ${formatTime12(utcToLocalTime(n.nextRunAt, settings.timezone))}`
                    : n.enabled
                      ? " · finished"
                      : " · paused"}
                </span>
                {n.lastError && <span className="error small">Last send failed: {n.lastError}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="stack">
        <h2>Quick ideas</h2>
        <p className="muted small">One tap to add. You can edit times afterward.</p>
        <div className="chips">
          {ideas.map((i) => (
            <button key={i.label} className="chip" onClick={() => addIdea(i.input)}>
              + {i.label}
            </button>
          ))}
        </div>
        {!settings.location && (
          <p className="muted small">
            Set your location in <a href="#/settings">Settings</a> to unlock the weather forecast.
          </p>
        )}
      </section>
    </div>
  );
}
