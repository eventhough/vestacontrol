import { useEffect, useMemo, useRef, useState } from "react";
import { COLOR_HEX, Layout, SYMBOL_62, emptyLayout, glyph, normalizeLayout } from "../../shared/characters";
import { Align, formatText } from "../../shared/formatter";
import type { Favorite, NoteContent, NoteInput, WidgetConfig, WidgetType } from "../../shared/types";
import { api } from "../api";
import { Board } from "../components/Board";
import { DesignEditor } from "../components/DesignEditor";
import { NotePreview } from "../components/NotePreview";
import { ScheduleDraft, ScheduleEditor, defaultDraft, draftFromSchedule, draftToSchedule } from "../components/ScheduleEditor";
import { WidgetEditor } from "../components/WidgetEditor";
import { Field, Segmented, Sheet } from "../components/ui";
import { errorMessage, navigate, useApp } from "../state";

type Kind = "text" | "design" | "widget";

const COLORS: [string, number][] = [
  ["red", 63],
  ["orange", 64],
  ["yellow", 65],
  ["green", 66],
  ["blue", 67],
  ["violet", 68],
  ["white", 69],
];

const ABBREV_LEVELS = [
  { value: "0", label: "Off" },
  { value: "1", label: "Natural" },
  { value: "2", label: "Texting" },
  { value: "3", label: "Max" },
];

export function Compose({ id, repeat }: { id?: string; repeat?: boolean }) {
  const { settings, size, author, setAuthor, toast } = useApp();
  const tz = settings.timezone;

  const [loading, setLoading] = useState(!!id);
  const [kind, setKind] = useState<Kind>(repeat ? "widget" : "text");
  const [text, setText] = useState("");
  const [align, setAlign] = useState<Align>("center");
  const [abbreviate, setAbbreviate] = useState(2);
  const [layout, setLayout] = useState<Layout>(() => emptyLayout(size.rows, size.cols));
  const [widget, setWidget] = useState<WidgetType>(repeat ? "weather" : "quote");
  const [config, setConfig] = useState<WidgetConfig>({});
  const [draft, setDraft] = useState<ScheduleDraft>(() => defaultDraft(tz, repeat));
  const [holdMinutes, setHoldMinutes] = useState(0);
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serverPreview, setServerPreview] = useState<{ layout?: Layout; error?: string; busy?: boolean } | null>(null);
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const load = (content: NoteContent) => {
    setKind(content.type);
    if (content.type === "text") {
      setText(content.text);
      setAlign(content.align ?? "center");
      setAbbreviate(content.abbreviate ?? 2);
    } else if (content.type === "design") {
      setLayout(normalizeLayout(content.layout, size.rows, size.cols));
    } else {
      setWidget(content.widget);
      setConfig(content.config ?? {});
    }
    setServerPreview(null);
  };

  useEffect(() => {
    if (!id) return;
    api
      .note(id)
      .then(({ note }) => {
        load(note.content);
        setDraft(draftFromSchedule(note.schedule, tz));
        setHoldMinutes(note.holdMinutes);
        setTitle(note.title ?? "");
        setEnabled(note.enabled);
        setLoading(false);
      })
      .catch((e) => {
        toast(errorMessage(e), "error");
        navigate({ name: "timeline" });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const content: NoteContent = useMemo(() => {
    if (kind === "text") return { type: "text", text, align, abbreviate };
    if (kind === "design") return { type: "design", layout };
    return { type: "widget", widget, config };
  }, [kind, text, align, abbreviate, layout, widget, config]);

  // Repeating notes can't protect themselves from other repeating notes, so they never carry a hold.
  const effectiveHold = draft.mode === "repeat" ? 0 : holdMinutes;
  const symbol62 = glyph(SYMBOL_62, settings.boardType);
  const formatted = useMemo(() => formatText(text, { board: settings.boardType, ...size, align, abbreviate }), [text, settings.boardType, size, align, abbreviate]);

  // Widgets render on the server; refresh the preview when their settings change.
  useEffect(() => setServerPreview(null), [widget, config]);

  const insertToken = (token: string) => {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const previewWidget = async () => {
    setServerPreview({ busy: true });
    try {
      const r = await api.preview(content);
      setServerPreview({ layout: r.layout });
    } catch (e) {
      setServerPreview({ error: errorMessage(e) });
    }
  };

  const validate = (): string | null => {
    if (kind === "text" && !text.trim()) return "Write a message first.";
    if (kind === "design" && layout.every((r) => r.every((c) => c === 0))) return "Your design is empty.";
    if (kind === "widget" && widget === "countdown" && !config.date) return "Pick a date for the countdown.";
    if (kind === "widget" && widget === "ai" && !config.prompt?.trim()) return "Tell Claude what to write.";
    if (kind === "widget" && widget === "rotation" && !(config.messages ?? []).some((m) => m.trim())) return "Add at least one message.";
    if (kind === "widget" && widget === "mix" && config.kinds?.length === 0) return "Pick at least one type for the mix.";
    if (draft.mode === "repeat" && draft.times.length === 0) return "Add at least one time.";
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) return toast(problem, "error");
    setBusy(true);
    try {
      if (draft.mode === "now") {
        await api.send(content, { author: author || null, title: title || null, holdMinutes: effectiveHold });
        toast("Sent to your Vestaboard ✨");
        navigate({ name: "timeline" });
        return;
      }
      const schedule = draftToSchedule(draft, tz);
      if (!schedule) throw new Error("Pick a date and time.");
      const input: NoteInput = { title: title || null, content, schedule, author: author || null, holdMinutes: effectiveHold, enabled };
      if (id) await api.updateNote(id, input);
      else await api.createNote(input);
      toast(id ? "Saved" : draft.mode === "repeat" ? "Repeating note created" : "Scheduled!");
      navigate({ name: draft.mode === "repeat" ? "repeats" : "timeline" });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    const problem = validate();
    if (problem) return toast(problem, "error");
    setBusy(true);
    try {
      await api.send(content, { author: author || null, title: title || null, holdMinutes: effectiveHold });
      toast("Sent to your Vestaboard ✨");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !confirm("Delete this note?")) return;
    try {
      await api.deleteNote(id);
      toast("Deleted");
      navigate({ name: "timeline" });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const saveFavorite = async () => {
    const problem = validate();
    if (problem && !problem.includes("time")) return toast(problem, "error");
    const name = prompt("Name this favorite", title || (kind === "text" ? text.slice(0, 30) : ""));
    if (!name) return;
    try {
      await api.addFavorite(name, content);
      toast("Saved to favorites ★");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const openFavorites = async () => {
    try {
      setFavorites((await api.favorites()).favorites);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  if (loading) return <p className="muted center">Loading…</p>;

  const primaryLabel = draft.mode === "now" ? "Send now" : id ? "Save changes" : draft.mode === "repeat" ? "Create repeating note" : "Schedule";

  return (
    <div className="stack-lg compose">
      <div className="row between">
        <h1>{id ? "Edit note" : "New note"}</h1>
        <button type="button" className="btn btn-ghost btn-sm" onClick={openFavorites}>
          ★ Favorites
        </button>
      </div>

      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k);
          setServerPreview(null);
        }}
        options={[
          { value: "text", label: "✏️ Message" },
          { value: "design", label: "🎨 Design" },
          { value: "widget", label: "✨ Smart" },
        ]}
      />

      {kind === "text" && (
        <section className="stack">
          <Board layout={formatted.layout} color={settings.boardColor} />
          <FitStatus fits={formatted.fits} lineCount={formatted.lineCount} rows={size.rows} abbreviations={formatted.abbreviations} empty={!text.trim()} />
          <textarea
            ref={textRef}
            className="input message-input"
            rows={3}
            placeholder="Type your message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus={!id}
          />
          <div className="color-row" aria-label="Insert color tile">
            {COLORS.map(([name, code]) => (
              <button key={name} type="button" className="color-dot" style={{ background: COLOR_HEX[code] }} aria-label={`Insert ${name} tile`} onClick={() => insertToken(`{${name}}`)} />
            ))}
            {/* Code 62: a heart on the Note, a degree sign on the Flagship. */}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => insertToken(symbol62)} aria-label={`Insert ${symbol62}`}>
              {symbol62}
            </button>
          </div>
          <div className="row wrap">
            <Field label="Align">
              <Segmented
                value={align}
                onChange={setAlign}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
              />
            </Field>
            <Field label="Shorten words to fit">
              <Segmented value={String(abbreviate)} onChange={(v) => setAbbreviate(Number(v))} options={ABBREV_LEVELS} />
            </Field>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setLayout(formatted.layout);
              setKind("design");
            }}
          >
            🎨 Fine-tune as a design
          </button>
        </section>
      )}

      {kind === "design" && <DesignEditor layout={layout} onChange={setLayout} boardColor={settings.boardColor} />}

      {kind === "widget" && (
        <section className="stack">
          <WidgetEditor
            widget={widget}
            config={config}
            onChange={(w, c) => {
              setWidget(w);
              setConfig(c);
            }}
          />
          <div className="stack-sm">
            <button type="button" className="btn" onClick={previewWidget} disabled={serverPreview?.busy}>
              {serverPreview?.busy ? "Rendering…" : serverPreview?.layout ? "↻ Preview another" : "👀 Preview"}
            </button>
            {serverPreview?.layout && <Board layout={serverPreview.layout} color={settings.boardColor} />}
            {serverPreview?.error && <p className="error">{serverPreview.error}</p>}
            {serverPreview?.layout && <p className="muted small">Smart notes are freshly generated each time they're sent.</p>}
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>When</h2>
        <ScheduleEditor draft={draft} onChange={setDraft} tz={tz} holdMinutes={holdMinutes} onHoldMinutes={setHoldMinutes} allowNow={!id} />
        <p className="muted small">Times are in {tz.replace(/_/g, " ")}.</p>
      </section>

      <section className="card stack">
        <Field label="Label (optional)">
          <input className="input" placeholder="e.g. Dentist reminder" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="From" hint="Remembered on this phone.">
          <input className="input" placeholder="Your name" maxLength={40} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </Field>
      </section>

      <div className="actions">
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={submit} disabled={busy}>
          {busy ? "Working…" : primaryLabel}
        </button>
        <div className="row">
          {draft.mode !== "now" && (
            <button type="button" className="btn btn-block" onClick={sendNow} disabled={busy}>
              Send now too
            </button>
          )}
          <button type="button" className="btn btn-block" onClick={saveFavorite}>
            ☆ Save favorite
          </button>
        </div>
        {id && (
          <button type="button" className="btn btn-danger btn-block" onClick={remove}>
            Delete note
          </button>
        )}
      </div>

      {favorites && (
        <Sheet title="Favorites" onClose={() => setFavorites(null)}>
          {favorites.length === 0 ? (
            <p className="muted">Nothing saved yet. Tap “Save favorite” on any message or design to reuse it later.</p>
          ) : (
            <ul className="fav-list">
              {favorites.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="fav-item"
                    onClick={() => {
                      load(f.content);
                      setFavorites(null);
                    }}
                  >
                    <strong>{f.name}</strong>
                    <NotePreview content={f.content} board={settings.boardType} boardColor={settings.boardColor} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Delete ${f.name}`}
                    onClick={async () => setFavorites((await api.deleteFavorite(f.id)).favorites)}
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </div>
  );
}

function FitStatus({
  fits,
  lineCount,
  rows,
  abbreviations,
  empty,
}: {
  fits: boolean;
  lineCount: number;
  rows: number;
  abbreviations: { from: string; to: string }[];
  empty: boolean;
}) {
  if (empty) return <p className="fit muted">Your message will appear here as you type.</p>;
  if (!fits)
    return (
      <p className="fit fit-bad">
        ⚠ Too long — needs {lineCount} lines, the board has {rows}. Try shorter words or a higher “shorten” level.
      </p>
    );
  if (abbreviations.length === 0) return <p className="fit fit-ok">✓ Fits perfectly</p>;
  return (
    <p className="fit fit-ok">
      ✓ Fits after shortening: {abbreviations.map((a) => `${a.from} → ${a.to}`).join(", ")}
    </p>
  );
}
