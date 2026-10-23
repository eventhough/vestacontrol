import type { Layout } from "../shared/characters";
import type { Favorite, HistoryEntry, Location, Note, NoteContent, NoteInput, PublicSettings, SettingsUpdate, TimelineItem } from "../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/login") && !path.startsWith("/settings/password")) onUnauthorized();
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  status: () => request<{ setupComplete: boolean; authenticated: boolean }>("GET", "/status"),
  setup: (body: SettingsUpdate & { password: string }) => request<{ ok: true }>("POST", "/setup", body),
  login: (password: string) => request<{ ok: true }>("POST", "/login", { password }),
  logout: () => request<{ ok: true }>("POST", "/logout"),

  settings: () => request<PublicSettings>("GET", "/settings"),
  saveSettings: (body: SettingsUpdate) => request<PublicSettings>("PUT", "/settings", body),
  changePassword: (current: string, next: string) => request<{ ok: true }>("POST", "/settings/password", { current, next }),
  clearHold: () => request<{ ok: true }>("POST", "/hold/clear"),
  geocode: (q: string) => request<{ results: (Location & { timezone?: string })[] }>("GET", `/geocode?q=${encodeURIComponent(q)}`),

  testBoard: (apiType: "rw" | "cloud", apiKey?: string) => request<{ ok: true; layout: Layout | null }>("POST", "/board/test", { apiType, apiKey }),
  currentBoard: () => request<{ layout: Layout | null }>("GET", "/board/current"),
  preview: (content: NoteContent) => request<{ layout: Layout; text: string | null }>("POST", "/preview", { content }),
  send: (content: NoteContent, opts: { author?: string | null; title?: string | null; holdMinutes?: number }) =>
    request<{ ok: true; layout: Layout }>("POST", "/send", { content, ...opts }),

  notes: () => request<{ notes: Note[] }>("GET", "/notes"),
  note: (id: string) => request<{ note: Note }>("GET", `/notes/${id}`),
  createNote: (input: NoteInput) => request<{ note: Note }>("POST", "/notes", input),
  updateNote: (id: string, input: NoteInput) => request<{ note: Note }>("PUT", `/notes/${id}`, input),
  setEnabled: (id: string, enabled: boolean) => request<{ note: Note }>("PATCH", `/notes/${id}/enabled`, { enabled }),
  deleteNote: (id: string) => request<{ ok: true }>("DELETE", `/notes/${id}`),
  sendNote: (id: string) => request<{ ok: true }>("POST", `/notes/${id}/send`),
  timeline: (days = 14) => request<{ items: TimelineItem[]; notes: Note[] }>("GET", `/timeline?days=${days}`),
  history: (limit = 50) => request<{ history: HistoryEntry[] }>("GET", `/history?limit=${limit}`),

  favorites: () => request<{ favorites: Favorite[] }>("GET", "/favorites"),
  addFavorite: (name: string, content: NoteContent) => request<{ favorites: Favorite[] }>("POST", "/favorites", { name, content }),
  deleteFavorite: (id: string) => request<{ favorites: Favorite[] }>("DELETE", `/favorites/${id}`),
};
