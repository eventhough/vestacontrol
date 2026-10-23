import { useState } from "react";
import type { SettingsUpdate } from "../../shared/types";
import { api } from "../api";
import { BoardTypePicker, ConnectionFields, LocationSearch, TimezoneSelect } from "../components/SettingsFields";
import { Field, Segmented, Switch } from "../components/ui";
import { errorMessage, useApp } from "../state";

export function SettingsScreen({ onSignOut }: { onSignOut: () => void }) {
  const { settings, setSettings, author, setAuthor, toast } = useApp();
  const [apiType, setApiType] = useState(settings.apiType);
  const [apiKey, setApiKey] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });

  const save = async (patch: SettingsUpdate, message = "Saved") => {
    try {
      setSettings(await api.saveSettings(patch));
      toast(message);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };

  const quietOn = !!(settings.quietStart && settings.quietEnd);

  return (
    <div className="stack-lg">
      <h1>Settings</h1>

      <section className="card stack">
        <h2>Your board</h2>
        <BoardTypePicker value={settings.boardType} onChange={(boardType) => save({ boardType })} />
        <Field label="Board color" hint="Used for previews.">
          <Segmented
            value={settings.boardColor}
            onChange={(boardColor) => save({ boardColor })}
            options={[
              { value: "black", label: "Black" },
              { value: "white", label: "White" },
            ]}
          />
        </Field>
      </section>

      <section className="card stack">
        <h2>Connection</h2>
        <ConnectionFields apiType={apiType} onApiType={setApiType} apiKey={apiKey} onApiKey={setApiKey} keyHint={settings.apiKeyHint} />
        <button
          className="btn btn-primary"
          disabled={!apiKey && apiType === settings.apiType}
          onClick={async () => {
            if (await save({ apiType, apiKey: apiKey || undefined }, "Connection saved")) setApiKey("");
          }}
        >
          Save connection
        </button>
      </section>

      <section className="card stack">
        <h2>Time & place</h2>
        <Field label="Time zone">
          <TimezoneSelect value={settings.timezone} onChange={(timezone) => save({ timezone })} />
        </Field>
        <Field label="Location (for weather)">
          <LocationSearch
            value={settings.location}
            onChange={(location) => save({ location }, location ? "Location saved" : "Location removed")}
          />
        </Field>
        <Field label="Temperature units">
          <Segmented
            value={settings.units}
            onChange={(units) => save({ units })}
            options={[
              { value: "f", label: "°F" },
              { value: "c", label: "°C" },
            ]}
          />
        </Field>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Quiet hours</h2>
          <Switch
            checked={quietOn}
            label="Quiet hours"
            onChange={(on) => save(on ? { quietStart: "22:00", quietEnd: "07:00" } : { quietStart: null, quietEnd: null })}
          />
        </div>
        <p className="muted small">Repeating notes won't flip the board during quiet hours. One-time notes still go out.</p>
        {quietOn && (
          <div className="row">
            <Field label="From">
              <input className="input" type="time" defaultValue={settings.quietStart!} onBlur={(e) => e.target.value !== settings.quietStart && save({ quietStart: e.target.value })} />
            </Field>
            <Field label="Until">
              <input className="input" type="time" defaultValue={settings.quietEnd!} onBlur={(e) => e.target.value !== settings.quietEnd && save({ quietEnd: e.target.value })} />
            </Field>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>You</h2>
        <Field label="Your name" hint="Shown on notes you create. Saved on this phone only.">
          <input className="input" value={author} maxLength={40} placeholder="e.g. Mom" onChange={(e) => setAuthor(e.target.value)} />
        </Field>
      </section>

      <section className="card stack">
        <h2>✨ Claude</h2>
        {settings.aiAvailable ? (
          <p className="ok">Connected. Smart notes can use Claude to write fresh quotes, questions, jokes and anything you ask for.</p>
        ) : (
          <p className="muted small">
            Optional. Add an Anthropic API key as the <code>ANTHROPIC_API_KEY</code> secret on your deployment to let Claude write fresh content. See the README.
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>Household password</h2>
        <p className="muted small">Changing it signs everyone else out.</p>
        <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <input className="input" type="password" placeholder="New password (6+ characters)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <button
          className="btn"
          disabled={!pw.current || pw.next.length < 6}
          onClick={async () => {
            try {
              await api.changePassword(pw.current, pw.next);
              setPw({ current: "", next: "" });
              toast("Password changed");
            } catch (e) {
              toast(errorMessage(e), "error");
            }
          }}
        >
          Change password
        </button>
      </section>

      <section className="card stack">
        <h2>Add to your home screen</h2>
        <p className="muted small">
          iPhone: tap <b>Share → Add to Home Screen</b>. Android: tap <b>⋮ → Add to Home screen</b>. Vestacontrol then opens like an app.
        </p>
      </section>

      <button
        className="btn btn-danger btn-block"
        onClick={async () => {
          await api.logout();
          onSignOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
