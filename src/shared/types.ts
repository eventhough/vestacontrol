import type { BoardType, Layout } from "./characters";
import type { Align, VAlign } from "./formatter";

/** Long passwords are what make guessing impractical, since the code (and the sign-in page) is public. */
export const MIN_PASSWORD_LENGTH = 12;

export type WidgetType = "weather" | "quote" | "question" | "joke" | "fact" | "countdown" | "date" | "rotation" | "ai";

export interface WidgetConfig {
  /** quote/question/joke/fact: use the built-in list or have Claude write a fresh one. */
  source?: "curated" | "ai";
  /** countdown */
  label?: string;
  date?: string; // YYYY-MM-DD
  yearly?: boolean;
  /** rotation */
  messages?: string[];
  /** ai */
  prompt?: string;
}

export type NoteContent =
  | { type: "text"; text: string; align?: Align; valign?: VAlign; abbreviate?: number }
  | { type: "design"; layout: Layout }
  | { type: "widget"; widget: WidgetType; config: WidgetConfig };

export type Schedule =
  | { type: "once"; at: number }
  | { type: "recurring"; days: number[]; times: string[]; until?: string | null };

export type NoteStatus = "scheduled" | "sent" | "missed" | "failed";

export interface Note {
  id: string;
  title: string | null;
  content: NoteContent;
  schedule: Schedule;
  nextRunAt: number | null;
  enabled: boolean;
  status: NoteStatus;
  author: string | null;
  holdMinutes: number;
  lastSentAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NoteInput {
  title?: string | null;
  content: NoteContent;
  schedule: Schedule;
  author?: string | null;
  holdMinutes?: number;
  enabled?: boolean;
}

export type ApiType = "rw" | "cloud";

export interface Location {
  name: string;
  lat: number;
  lon: number;
}

export interface PublicSettings {
  boardType: BoardType;
  boardColor: "black" | "white";
  apiType: ApiType;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  timezone: string;
  location: Location | null;
  units: "f" | "c";
  quietStart: string | null;
  quietEnd: string | null;
  holdUntil: number | null;
  aiAvailable: boolean;
}

export interface SettingsUpdate {
  boardType?: BoardType;
  boardColor?: "black" | "white";
  apiType?: ApiType;
  apiKey?: string;
  timezone?: string;
  location?: Location | null;
  units?: "f" | "c";
  quietStart?: string | null;
  quietEnd?: string | null;
}

export interface TimelineItem {
  noteId: string;
  at: number;
  recurring: boolean;
}

export interface HistoryEntry {
  id: number;
  noteId: string | null;
  title: string | null;
  layout: Layout | null;
  status: "sent" | "failed" | "skipped";
  detail: string | null;
  author: string | null;
  createdAt: number;
}

export interface Favorite {
  id: string;
  name: string;
  content: NoteContent;
  createdAt: number;
}

export const WIDGETS: Record<WidgetType, { label: string; icon: string; description: string }> = {
  weather: { label: "Weather forecast", icon: "🌤️", description: "Today's conditions, high and low, and chance of rain." },
  quote: { label: "Quote of the day", icon: "💬", description: "A short, inspiring quote." },
  question: { label: "Question of the day", icon: "❓", description: "A conversation starter for the family." },
  joke: { label: "Joke of the day", icon: "😄", description: "A groan-worthy one-liner." },
  fact: { label: "Fun fact", icon: "💡", description: "Something surprising to learn." },
  countdown: { label: "Countdown", icon: "⏳", description: "Days until a birthday, trip or holiday." },
  date: { label: "Date & greeting", icon: "📅", description: "Good morning + today's date." },
  rotation: { label: "Message rotation", icon: "🔁", description: "Shows the next message from your list each time it runs, then starts over." },
  ai: { label: "Ask Claude", icon: "✨", description: "Fresh content from your own prompt, written to fit the board." },
};
