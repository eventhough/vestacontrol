import { FormEvent, useState } from "react";
import type { BoardType } from "../../shared/characters";
import type { ApiType, Location } from "../../shared/types";
import { api } from "../api";
import { Logo } from "../App";
import { BoardTypePicker, ConnectionFields, LocationSearch, TimezoneSelect, deviceTimeZone } from "../components/SettingsFields";
import { Field, Segmented } from "../components/ui";

type Step = "welcome" | "connect" | "extras";

export function Setup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [boardType, setBoardType] = useState<BoardType>("note");
  const [timezone, setTimezone] = useState(deviceTimeZone());
  const [apiType, setApiType] = useState<ApiType>("rw");
  const [apiKey, setApiKey] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [units, setUnits] = useState<"f" | "c">(timezone.startsWith("America/") ? "f" : "c");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const createAccount = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords don't match.");
    void run(async () => {
      await api.setup({ password, boardType, timezone });
      setStep("connect");
    });
  };

  return (
    <div className="auth">
      <Logo />
      <div className="steps">
        {(["welcome", "connect", "extras"] as Step[]).map((s) => (
          <span key={s} className={s === step ? "active" : ""} />
        ))}
      </div>

      {step === "welcome" && (
        <form className="card auth-card stack" onSubmit={createAccount}>
          <h1>Let's set up Vestacontrol</h1>
          <p className="muted">Schedule notes, designs and daily surprises for your Vestaboard — for the whole household.</p>
          <Field label="Which Vestaboard do you have?">
            <BoardTypePicker value={boardType} onChange={setBoardType} />
          </Field>
          <Field label="Household password" hint="Share this with your family. Everyone uses the same one.">
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password">
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Field label="Time zone" hint="Scheduled notes go out at this local time.">
            <TimezoneSelect value={timezone} onChange={setTimezone} />
          </Field>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || password.length < 6}>
            {busy ? "Creating…" : "Continue"}
          </button>
          {password.length > 0 && password.length < 6 && <p className="muted small">At least 6 characters.</p>}
        </form>
      )}

      {step === "connect" && (
        <div className="card auth-card stack">
          <h1>Connect your board</h1>
          <p className="muted">Vestacontrol talks to your Vestaboard through its official API.</p>
          <ConnectionFields apiType={apiType} onApiType={setApiType} apiKey={apiKey} onApiKey={setApiKey} />
          {error && <p className="error">{error}</p>}
          <button
            className="btn btn-primary btn-block"
            disabled={busy || !apiKey}
            onClick={() =>
              run(async () => {
                await api.saveSettings({ apiType, apiKey });
                setStep("extras");
              })
            }
          >
            Save & continue
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setStep("extras")}>
            I'll do this later
          </button>
        </div>
      )}

      {step === "extras" && (
        <div className="card auth-card stack">
          <h1>Weather (optional)</h1>
          <p className="muted">Add your location to use the daily weather forecast.</p>
          <LocationSearch value={location} onChange={(loc) => setLocation(loc)} />
          <Field label="Units">
            <Segmented
              value={units}
              onChange={setUnits}
              options={[
                { value: "f", label: "°F" },
                { value: "c", label: "°C" },
              ]}
            />
          </Field>
          {error && <p className="error">{error}</p>}
          <button
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.saveSettings({ location, units });
                onDone();
              })
            }
          >
            Finish
          </button>
        </div>
      )}
    </div>
  );
}
