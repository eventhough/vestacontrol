import { useEffect, useState } from "react";
import { normalizeLayout } from "../../shared/characters";
import { formatTime12, utcToLocalDate, utcToLocalTime } from "../../shared/schedule";
import type { HistoryEntry } from "../../shared/types";
import { api } from "../api";
import { Board } from "../components/Board";
import { Empty } from "../components/ui";
import { errorMessage, useApp } from "../state";
import { dayLabel } from "./Timeline";

export function History() {
  const { settings, size, author, toast } = useApp();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  useEffect(() => {
    api
      .history(100)
      .then((r) => setEntries(r.history))
      .catch((e) => toast(errorMessage(e), "error"));
  }, [toast]);

  const resend = async (e: HistoryEntry) => {
    if (!e.layout) return;
    try {
      await api.send({ type: "design", layout: normalizeLayout(e.layout, size.rows, size.cols) }, { author: author || null, title: e.title ? `Resent: ${e.title}` : "Resent" });
      toast("Sent again ✨");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const shown = entries?.filter((e) => showSkipped || e.status !== "skipped") ?? [];

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1>History</h1>
        <label className="row small muted">
          <input type="checkbox" checked={showSkipped} onChange={(e) => setShowSkipped(e.target.checked)} /> Show skipped
        </label>
      </div>
      {entries === null ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <Empty icon="🕘" title="Nothing sent yet">
          <p className="muted">Everything that goes to your board shows up here.</p>
        </Empty>
      ) : (
        <ul className="cards">
          {shown.map((e) => (
            <li key={e.id} className="card stack-sm">
              <div className="row between">
                <strong>{e.title || (e.noteId ? "Scheduled note" : "Sent now")}</strong>
                <span className={`badge badge-${e.status}`}>{e.status}</span>
              </div>
              <span className="muted small">
                {dayLabel(utcToLocalDate(e.createdAt, settings.timezone), settings.timezone)} at {formatTime12(utcToLocalTime(e.createdAt, settings.timezone))}
                {e.author ? ` · from ${e.author}` : ""}
              </span>
              {e.layout && <Board layout={e.layout} size="sm" color={settings.boardColor} />}
              {e.detail && <span className={e.status === "failed" ? "error small" : "muted small"}>{e.detail}</span>}
              {e.layout && (
                <button className="btn btn-sm" onClick={() => resend(e)}>
                  ↺ Send again
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
