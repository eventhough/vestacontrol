import { useState } from "react";
import { formatTime12, localToUtc, utcToLocalDate, utcToLocalTime } from "../../shared/schedule";
import { api } from "../api";
import { errorMessage, useApp } from "../state";
import { Sheet } from "./ui";

const DURATIONS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 480, label: "8 hours" },
  { minutes: 1440, label: "24 hours" },
];

/** Minutes from now until the next time the board's clock reads `time` (at most 24 hours). */
function minutesUntil(time: string, tz: string): number | null {
  const now = Date.now();
  let at = localToUtc(utcToLocalDate(now, tz), time, tz);
  if (at === null) return null;
  if (at <= now) at = localToUtc(utcToLocalDate(now + 86_400_000, tz), time, tz)!;
  return Math.min(1440, Math.max(1, Math.ceil((at - now) / 60_000)));
}

/** Pin what's on the board so repeating notes skip their turns until the pin ends. */
export function PinSheet({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, toast } = useApp();
  const [until, setUntil] = useState("21:00");
  const [busy, setBusy] = useState(false);

  const pin = async (minutes: number | null) => {
    if (!minutes) return toast("Pick a time.", "error");
    setBusy(true);
    try {
      const s = await api.pin(minutes);
      setSettings(s);
      toast(`📌 Pinned until ${formatTime12(utcToLocalTime(s.holdUntil!, settings.timezone))}`);
      onClose();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="📌 Pin what's on the board" onClose={onClose}>
      <div className="stack">
        <p className="muted small">
          Repeating notes are skipped (not delayed) while it's pinned. One-time notes and Send now still replace it.
        </p>
        <div className="pin-grid">
          {DURATIONS.map((d) => (
            <button key={d.minutes} type="button" className="btn" disabled={busy} onClick={() => pin(d.minutes)}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="row">
          <span className="muted">Until</span>
          <input className="input" type="time" value={until} onChange={(e) => setUntil(e.target.value)} />
          <button type="button" className="btn btn-primary" disabled={busy || !until} onClick={() => pin(minutesUntil(until, settings.timezone))}>
            Pin
          </button>
        </div>
      </div>
    </Sheet>
  );
}
