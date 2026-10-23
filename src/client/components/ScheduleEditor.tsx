import { useState } from "react";
import { formatTime12, localToUtc, utcToLocalDate, utcToLocalTime, zonedParts } from "../../shared/schedule";
import type { Schedule } from "../../shared/types";
import { Field, Segmented } from "./ui";

export interface ScheduleDraft {
  mode: "now" | "once" | "repeat";
  date: string;
  time: string;
  days: number[];
  times: string[];
  until: string;
}

export function defaultDraft(tz: string, repeat = false): ScheduleDraft {
  // Default to the next round hour.
  const next = Date.now() + 60 * 60_000;
  return {
    mode: repeat ? "repeat" : "now",
    date: utcToLocalDate(next, tz),
    time: `${utcToLocalTime(next, tz).slice(0, 2)}:00`,
    days: [0, 1, 2, 3, 4, 5, 6],
    times: ["08:00"],
    until: "",
  };
}

export function draftFromSchedule(s: Schedule, tz: string): ScheduleDraft {
  const base = defaultDraft(tz);
  if (s.type === "once") return { ...base, mode: "once", date: utcToLocalDate(s.at, tz), time: utcToLocalTime(s.at, tz) };
  return { ...base, mode: "repeat", days: s.days.length ? s.days : [0, 1, 2, 3, 4, 5, 6], times: s.times, until: s.until ?? "" };
}

export function draftToSchedule(d: ScheduleDraft, tz: string): Schedule | null {
  if (d.mode === "once") {
    const at = localToUtc(d.date, d.time, tz);
    return at === null ? null : { type: "once", at };
  }
  if (d.mode === "repeat") return { type: "recurring", days: d.days, times: d.times, until: d.until || null };
  return null;
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const HOLD_OPTIONS = [
  { value: 0, label: "No minimum" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 1440, label: "24 hours" },
];

function quickPicks(tz: string): { label: string; date: string; time: string }[] {
  const now = Date.now();
  const today = utcToLocalDate(now, tz);
  const tomorrow = utcToLocalDate(now + 86_400_000, tz);
  const p = zonedParts(now, tz);
  const picks: { label: string; date: string; time: string }[] = [];
  if (p.hour < 17) picks.push({ label: "This evening", date: today, time: "18:00" });
  picks.push({ label: "Tomorrow 7 AM", date: tomorrow, time: "07:00" });
  const toSat = (6 - p.weekday + 7) % 7 || 7;
  picks.push({ label: "Saturday 9 AM", date: utcToLocalDate(now + toSat * 86_400_000, tz), time: "09:00" });
  return picks;
}

export function ScheduleEditor({
  draft,
  onChange,
  tz,
  holdMinutes,
  onHoldMinutes,
  allowNow = true,
}: {
  draft: ScheduleDraft;
  onChange: (d: ScheduleDraft) => void;
  tz: string;
  holdMinutes: number;
  onHoldMinutes: (m: number) => void;
  allowNow?: boolean;
}) {
  const [newTime, setNewTime] = useState("12:00");
  const [hourly, setHourly] = useState({ from: "07:00", to: "21:00", every: 60 });
  const [showHourly, setShowHourly] = useState(false);
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch });

  const toggleDay = (d: number) => set({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort() });
  const addTime = (t: string) => set({ times: [...new Set([...draft.times, t])].sort() });
  const generateHourly = () => {
    const [fh, fm] = hourly.from.split(":").map(Number);
    const [th, tm] = hourly.to.split(":").map(Number);
    const out: string[] = [];
    for (let m = fh * 60 + fm; m <= th * 60 + tm && out.length < 96; m += hourly.every) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
    set({ times: out });
    setShowHourly(false);
  };

  return (
    <div className="stack">
      <Segmented
        value={draft.mode}
        onChange={(mode) => set({ mode })}
        options={[
          ...(allowNow ? [{ value: "now" as const, label: "Send now" }] : []),
          { value: "once", label: "Later" },
          { value: "repeat", label: "Repeat" },
        ]}
      />

      {draft.mode === "once" && (
        <div className="stack-sm">
          <div className="row">
            <input className="input" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            <input className="input" type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
          </div>
          <div className="chips">
            {quickPicks(tz).map((p) => (
              <button key={p.label} type="button" className="chip" onClick={() => set({ date: p.date, time: p.time })}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {draft.mode === "repeat" && (
        <div className="stack">
          <Field label="On these days">
            <div className="days">
              {DAY_LETTERS.map((l, d) => (
                <button key={d} type="button" aria-label={DAY_NAMES[d]} aria-pressed={draft.days.includes(d)} className={`day${draft.days.includes(d) ? " active" : ""}`} onClick={() => toggleDay(d)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="chips">
              <button type="button" className="chip" onClick={() => set({ days: [0, 1, 2, 3, 4, 5, 6] })}>
                Every day
              </button>
              <button type="button" className="chip" onClick={() => set({ days: [1, 2, 3, 4, 5] })}>
                Weekdays
              </button>
              <button type="button" className="chip" onClick={() => set({ days: [0, 6] })}>
                Weekends
              </button>
            </div>
          </Field>

          <Field label="At these times">
            <div className="chips">
              {draft.times.map((t) => (
                <span key={t} className="chip chip-on">
                  {formatTime12(t)}
                  <button type="button" aria-label={`Remove ${t}`} onClick={() => set({ times: draft.times.filter((x) => x !== t) })}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="row">
              <input className="input" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              <button type="button" className="btn" onClick={() => newTime && addTime(newTime)}>
                Add time
              </button>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowHourly(!showHourly)}>
              {showHourly ? "Cancel" : "Every hour between…"}
            </button>
            {showHourly && (
              <div className="row wrap">
                <input className="input" type="time" value={hourly.from} onChange={(e) => setHourly({ ...hourly, from: e.target.value })} />
                <span className="muted">to</span>
                <input className="input" type="time" value={hourly.to} onChange={(e) => setHourly({ ...hourly, to: e.target.value })} />
                <select className="input" value={hourly.every} onChange={(e) => setHourly({ ...hourly, every: Number(e.target.value) })}>
                  <option value={30}>every 30 min</option>
                  <option value={60}>every hour</option>
                  <option value={120}>every 2 hours</option>
                  <option value={180}>every 3 hours</option>
                </select>
                <button type="button" className="btn" onClick={generateHourly}>
                  Set times
                </button>
              </div>
            )}
          </Field>

          <Field label="Stop repeating after (optional)">
            <input className="input" type="date" value={draft.until} onChange={(e) => set({ until: e.target.value })} />
          </Field>
        </div>
      )}

      <Field label="Keep it on the board for at least" hint="Repeating notes will wait until this time is up.">
        <select className="input" value={holdMinutes} onChange={(e) => onHoldMinutes(Number(e.target.value))}>
          {HOLD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
