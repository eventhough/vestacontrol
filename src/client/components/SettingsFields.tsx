import { useMemo, useState } from "react";
import { BOARD_SIZES, BoardType, Layout } from "../../shared/characters";
import type { ApiType, Location } from "../../shared/types";
import { api } from "../api";
import { Board } from "./Board";
import { Field, Segmented } from "./ui";

export function BoardTypePicker({ value, onChange }: { value: BoardType; onChange: (v: BoardType) => void }) {
  return (
    <div className="choice-grid">
      {(Object.keys(BOARD_SIZES) as BoardType[]).map((t) => (
        <button key={t} type="button" className={`choice${value === t ? " active" : ""}`} onClick={() => onChange(t)}>
          <div className={`choice-art choice-${t}`} />
          <strong>{t === "note" ? "Vestaboard Note" : "Vestaboard Flagship"}</strong>
          <span className="muted">
            {BOARD_SIZES[t].rows} rows × {BOARD_SIZES[t].cols} characters
          </span>
        </button>
      ))}
    </div>
  );
}

export function ConnectionFields({
  apiType,
  onApiType,
  apiKey,
  onApiKey,
  keyHint,
}: {
  apiType: ApiType;
  onApiType: (v: ApiType) => void;
  apiKey: string;
  onApiKey: (v: string) => void;
  keyHint?: string | null;
}) {
  const [test, setTest] = useState<{ busy?: boolean; error?: string; layout?: Layout | null; ok?: boolean }>({});

  const runTest = async () => {
    setTest({ busy: true });
    try {
      const r = await api.testBoard(apiType, apiKey || undefined);
      setTest({ ok: true, layout: r.layout });
    } catch (e) {
      setTest({ error: e instanceof Error ? e.message : "Connection failed" });
    }
  };

  return (
    <div className="stack">
      <Field label="API type">
        <Segmented
          value={apiType}
          onChange={onApiType}
          options={[
            { value: "rw", label: "Read/Write key" },
            { value: "cloud", label: "Cloud API token" },
          ]}
        />
      </Field>
      <Field
        label={apiType === "rw" ? "Read/Write API key" : "Cloud API token"}
        hint={
          apiType === "rw" ? (
            <>
              In the Vestaboard app: <b>Settings → Developer → Read/Write API</b>, enable it and copy the key.
            </>
          ) : (
            <>
              At <b>web.vestaboard.com</b>: open your board → <b>Developer → API</b> and create a token.
            </>
          )
        }
      >
        <input
          className="input mono"
          type="password"
          autoComplete="off"
          placeholder={keyHint ? `Saved (${keyHint}) — paste to replace` : "Paste key here"}
          value={apiKey}
          onChange={(e) => onApiKey(e.target.value)}
        />
      </Field>
      <button type="button" className="btn" onClick={runTest} disabled={test.busy || (!apiKey && !keyHint)}>
        {test.busy ? "Testing…" : "Test connection"}
      </button>
      {test.error && <p className="error">{test.error}</p>}
      {test.ok && (
        <div className="stack-sm">
          <p className="ok">✓ Connected! {test.layout ? "Here's what's on your board right now:" : ""}</p>
          {test.layout && <Board layout={test.layout} size="sm" />}
        </div>
      )}
    </div>
  );
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
}

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const zones = useMemo(() => {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    return list.includes(value) ? list : [value, ...list];
  }, [value]);
  const device = deviceTimeZone();
  return (
    <div className="stack-sm">
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {device !== value && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(device)}>
          Use this phone's time zone ({device.replace(/_/g, " ")})
        </button>
      )}
    </div>
  );
}

export function LocationSearch({ value, onChange }: { value: Location | null; onChange: (loc: Location | null, tz?: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<(Location & { timezone?: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.geocode(q);
      setResults(r.results);
      if (r.results.length === 0) setError("No places found. Try a city name.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-sm">
      {value && (
        <div className="row between">
          <span>📍 {value.name}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
            Remove
          </button>
        </div>
      )}
      <div className="row">
        <input
          className="input"
          placeholder="Search city or ZIP"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="btn" onClick={search} disabled={busy}>
          {busy ? "…" : "Search"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {results.length > 0 && (
        <ul className="list">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                className="list-btn"
                onClick={() => {
                  onChange({ name: r.name, lat: r.lat, lon: r.lon }, r.timezone);
                  setResults([]);
                  setQ("");
                }}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
