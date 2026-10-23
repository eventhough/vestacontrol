import type { WidgetConfig, WidgetType } from "../../shared/types";
import { WIDGETS } from "../../shared/types";
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

      {(widget === "quote" || widget === "question" || widget === "joke" || widget === "fact") && (
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
        <Field label="Messages (one per line)" hint="Each time this note runs it shows the next message.">
          <textarea
            className="input"
            rows={6}
            placeholder={"DRINK WATER\nYOU ARE LOVED\nTAKE OUT THE TRASH"}
            value={(config.messages ?? []).join("\n")}
            onChange={(e) => set({ messages: e.target.value.split("\n") })}
          />
        </Field>
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
