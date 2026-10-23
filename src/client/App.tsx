import { useEffect, useState } from "react";
import type { PublicSettings } from "../shared/types";
import { api, setUnauthorizedHandler } from "./api";
import { Compose } from "./screens/Compose";
import { History } from "./screens/History";
import { Login } from "./screens/Login";
import { Repeats } from "./screens/Repeats";
import { SettingsScreen } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { Timeline } from "./screens/Timeline";
import { AppProvider, Route, routeHref, useRoute } from "./state";

type Phase = { kind: "loading" } | { kind: "setup" } | { kind: "login" } | { kind: "ready"; settings: PublicSettings } | { kind: "offline"; message: string };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const load = async () => {
    try {
      const status = await api.status();
      if (!status.setupComplete) return setPhase({ kind: "setup" });
      if (!status.authenticated) return setPhase({ kind: "login" });
      setPhase({ kind: "ready", settings: await api.settings() });
    } catch (e) {
      setPhase({ kind: "offline", message: e instanceof Error ? e.message : "Can't reach the server." });
    }
  };

  useEffect(() => {
    setUnauthorizedHandler(() => setPhase({ kind: "login" }));
    void load();
  }, []);

  switch (phase.kind) {
    case "loading":
      return <Splash />;
    case "offline":
      return (
        <Splash>
          <p className="muted">{phase.message}</p>
          <button className="btn" onClick={load}>
            Try again
          </button>
        </Splash>
      );
    case "setup":
      return <Setup onDone={load} />;
    case "login":
      return <Login onDone={load} />;
    case "ready":
      return (
        <AppProvider initial={phase.settings}>
          <Shell onSignOut={() => setPhase({ kind: "login" })} />
        </AppProvider>
      );
  }
}

function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <div className="splash">
      <Logo />
      {children}
    </div>
  );
}

export function Logo() {
  return (
    <div className="logo" aria-label="Vestacontrol">
      {"VESTA".split("").map((ch, i) => (
        <span key={i} className="logo-tile">
          {ch}
        </span>
      ))}
      <span className="logo-tile logo-accent" />
      <span className="logo-word">control</span>
    </div>
  );
}

const TABS: { route: Route; label: string; icon: string }[] = [
  { route: { name: "timeline" }, label: "Timeline", icon: "🗓️" },
  { route: { name: "repeats" }, label: "Repeats", icon: "🔁" },
  { route: { name: "compose" }, label: "New", icon: "+" },
  { route: { name: "history" }, label: "History", icon: "🕘" },
  { route: { name: "settings" }, label: "Settings", icon: "⚙️" },
];

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const route = useRoute();
  return (
    <div className="app">
      <header className="topbar">
        <a href="#/timeline" className="topbar-logo">
          <Logo />
        </a>
      </header>
      <main className="content">
        {route.name === "timeline" && <Timeline />}
        {route.name === "compose" && <Compose key={route.id ?? (route.repeat ? "new-repeat" : "new")} id={route.id} repeat={route.repeat} />}
        {route.name === "repeats" && <Repeats />}
        {route.name === "history" && <History />}
        {route.name === "settings" && <SettingsScreen onSignOut={onSignOut} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => {
          const active = t.route.name === route.name;
          const isNew = t.route.name === "compose";
          return (
            <a key={t.label} href={routeHref(t.route)} className={`tab${active ? " active" : ""}${isNew ? " tab-new" : ""}`}>
              <span className="tab-icon" aria-hidden>
                {t.icon}
              </span>
              <span className="tab-label">{t.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
