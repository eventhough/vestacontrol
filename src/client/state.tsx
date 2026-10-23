import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { BOARD_SIZES } from "../shared/characters";
import type { PublicSettings } from "../shared/types";
import { api } from "./api";

// ---------- routing (hash based, so deep links work on any static host) ----------

export type Route =
  | { name: "timeline" }
  | { name: "compose"; id?: string; repeat?: boolean }
  | { name: "repeats" }
  | { name: "history" }
  | { name: "settings" };

function parseHash(hash: string): Route {
  const [, name, arg] = hash.replace(/^#/, "").split("/");
  if (name === "compose") return { name, id: arg && arg !== "repeat" ? arg : undefined, repeat: arg === "repeat" };
  if (name === "repeats" || name === "history" || name === "settings") return { name };
  return { name: "timeline" };
}

export function routeHref(r: Route): string {
  if (r.name === "compose") return r.id ? `#/compose/${r.id}` : r.repeat ? "#/compose/repeat" : "#/compose";
  return `#/${r.name}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(r: Route) {
  location.hash = routeHref(r);
}

// ---------- app-wide state ----------

interface AppState {
  settings: PublicSettings;
  setSettings: (s: PublicSettings) => void;
  refreshSettings: () => Promise<void>;
  size: { rows: number; cols: number };
  author: string;
  setAuthor: (name: string) => void;
  toast: (message: string, kind?: "ok" | "error") => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

function readAuthor(): string {
  try {
    return localStorage.getItem("vc_author") ?? "";
  } catch {
    return "";
  }
}

export function AppProvider({ initial, children }: { initial: PublicSettings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const [author, setAuthorState] = useState(readAuthor);
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: "ok" | "error" }[]>([]);

  const refreshSettings = useCallback(async () => setSettings(await api.settings()), []);
  const setAuthor = useCallback((name: string) => {
    setAuthorState(name);
    try {
      localStorage.setItem("vc_author", name);
    } catch {
      // private mode: the name just won't be remembered
    }
  }, []);
  const toast = useCallback((message: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 5000 : 2800);
  }, []);

  return (
    <Ctx.Provider value={{ settings, setSettings, refreshSettings, size: BOARD_SIZES[settings.boardType], author, setAuthor, toast }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
