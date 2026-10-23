import { DAILY_KINDS, WIDGETS, type DailyKind, type WidgetConfig, type WidgetType } from "../../shared/types";
import { BOARD_SIZES } from "../../shared/characters";
import { formatText } from "../../shared/formatter";
import { useApp } from "../state";
import { Field, Segmented } from "./ui";

const AI_IDEAS = [
  "A fun fact about space",
  "A riddle for the kids (answer on the last line)",
  "A word of the day with a short definition",
  "A tiny poem about today's season",
  "A compliment for the whole family",
  "On this day in history",
];

export function WidgetEditor({
  widget,
  config,
  onChange,
}: {
  widget: WidgetType;
  config: WidgetConfig;
  onChange: (widget: WidgetType, config: WidgetConfig) => void;
}) {
  const { settings } = useApp();
  const set = (patch: Partial<WidgetConfig>) => onChange(widget, { ...config, ...patch });

  return (
    <div className="stack">
      <div className="widget-grid">
        {(Object.keys(WIDGETS) as WidgetType[]).map((w) => (
          <button key={w} type="button" className={`widget-card${widget === w ? " active" : ""}`} onClick={() => onChange(w, w === widget ? config : {})}>
            <span className="widget-icon">{WIDGETS[w].icon}</span>
            <span className="widget-label">{WIDGETS[w].label}</span>
          </button>
        ))}
      </div>
      <p className="muted">{WIDGETS[widget].description}</p>

      {widget === "mix" && <MixPicker kinds={config.kinds ?? DAILY_KINDS} onChange={(kinds) => set({ kinds })} />}

      {(widget === "mix" || (DAILY_KINDS as WidgetType[]).includes(widget)) && (
        <Field
          label="Where should it come from?"
          hint={settings.aiAvailable ? "Claude writes a fresh one every time, sized to fit your board." : "Add an Anthropic API key to let Claude write fresh ones (see README)."}
        >
          <Segmented
            value={config.source ?? "curated"}
            onChange={(source) => set({ source })}
            options={[
              { value: "curated", label: "Built-in list" },
              { value: "ai", label: "✨ Claude", disabled: !settings.aiAvailable },
            ]}
          />
        </Field>
      )}

      {widget === "weather" && !settings.location && (
        <p className="warn">
          Set your location in <a href="#/settings">Settings</a> first.
        </p>
      )}
      {widget === "weather" && settings.location && <p className="muted small">📍 {settings.location.name}</p>}

      {widget === "countdown" && (
        <>
          <Field label="Counting down to">
            <input className="input" placeholder="e.g. Disney trip" maxLength={40} value={config.label ?? ""} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={config.date ?? ""} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={!!config.yearly} onChange={(e) => set({ yearly: e.target.checked })} /> Repeats every year (birthdays, holidays)
          </label>
        </>
      )}

      {widget === "rotation" && (
        <>
          <Field
            label="Messages to rotate through (one per line)"
            hint="Each time this note runs, the board shows the next message in the list. After the last one, it starts over from the top."
          >
            <textarea
              className="input"
              rows={6}
              placeholder={"DRINK WATER\nYOU ARE LOVED\nTAKE OUT THE TRASH"}
              value={(config.messages ?? []).join("\n")}
              onChange={(e) => set({ messages: e.target.value.split("\n") })}
            />
          </Field>
          <RotationOrder messages={config.messages ?? []} />
        </>
      )}

      {widget === "ai" && (
        <>
          {!settings.aiAvailable && <p className="warn">Claude isn't set up yet. Add an Anthropic API key to enable this (see README).</p>}
          <Field label="What should Claude write?">
            <textarea className="input" rows={3} placeholder="A fun fact about space" value={config.prompt ?? ""} onChange={(e) => set({ prompt: e.target.value })} />
          </Field>
          <div className="chips">
            {AI_IDEAS.map((idea) => (
              <button key={idea} type="button" className="chip" onClick={() => set({ prompt: idea })}>
                {idea}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The order messages will appear in, with a warning for any that won't fit the board. */
function RotationOrder({ messages }: { messages: string[] }) {
  const { settings } = useApp();
  const list = messages.map((m) => m.trim()).filter(Boolean);
  if (list.length === 0) return null;
  const size = BOARD_SIZES[settings.boardType];
  return (
    <div className="stack-sm">
      <span className="field-label">Order on the board</span>
      <ol className="rotation-order">
        {list.map((m, i) => {
          const fits = formatText(m, { board: settings.boardType, ...size }).fits;
          return (
            <li key={i}>
              <span className="muted small">{ordinal(i + 1)} run</span> {m}
              {!fits && <span className="warn small"> · too long, will be cut off</span>}
            </li>
          );
        })}
      </ol>
      <p className="muted small">
        {list.length > 1 ? `Then back to the first message on run ${list.length + 1}. ` : "With one message, it shows the same thing every time. "}
        Skipped runs (quiet hours, protected messages) and failed sends don't move it forward. Preview and Send now always show the first
        message.
      </p>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Pick which daily types the Smart mix takes turns between, and show the order they'll run in. */
function MixPicker({ kinds, onChange }: { kinds: DailyKind[]; onChange: (kinds: DailyKind[]) => void }) {
  const chosen = DAILY_KINDS.filter((k) => kinds.includes(k));
  const toggle = (k: DailyKind) => onChange(chosen.includes(k) ? chosen.filter((x) => x !== k) : DAILY_KINDS.filter((x) => x === k || chosen.includes(x)));
  return (
    <>
      <Field label="Take turns between" hint="Tap to add or remove. Pick as few as one.">
        <div className="chips">
          {DAILY_KINDS.map((k) => (
            <button key={k} type="button" className={`chip${chosen.includes(k) ? " chip-selected" : ""}`} aria-pressed={chosen.includes(k)} onClick={() => toggle(k)}>
              {WIDGETS[k].icon} {WIDGETS[k].label}
            </button>
          ))}
        </div>
      </Field>
      {chosen.length === 0 ? (
        <p className="warn small">Pick at least one type.</p>
      ) : (
        <div className="stack-sm">
          <span className="field-label">Order on the board</span>
          <ol className="rotation-order">
            {chosen.map((k, i) => (
              <li key={k}>
                <span className="muted small">{ordinal(i + 1)} run</span> {WIDGETS[k].icon} {WIDGETS[k].label}
              </li>
            ))}
          </ol>
          <p className="muted small">
            {chosen.length > 1 ? `Then back to the first type on run ${chosen.length + 1}. ` : ""}
            Each type keeps its own place in its list, so nothing repeats until that list starts over. Skipped runs and failed sends don't move it
            forward, and Preview and Send now always show the first type.
          </p>
        </div>
      )}
    </>
  );
}
