import { BOARD_SIZES } from "../shared/characters";
import { isValidTimeZone, parseDate, parseTime } from "../shared/schedule";
import type { NoteContent, NoteInput, Schedule, SettingsUpdate, WidgetType } from "../shared/types";
import { DAILY_KINDS, WIDGETS } from "../shared/types";

export class ValidationError extends Error {}

function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new ValidationError(message);
}

const MAX = BOARD_SIZES.flagship;

export function validateContent(c: unknown): NoteContent {
  check(c && typeof c === "object", "Missing content");
  const content = c as NoteContent;
  switch (content.type) {
    case "text":
      check(typeof content.text === "string" && content.text.trim().length > 0, "Write a message first");
      check(content.text.length <= 1000, "Message is too long");
      check(content.abbreviate === undefined || (Number.isInteger(content.abbreviate) && content.abbreviate >= 0 && content.abbreviate <= 3), "Bad abbreviate level");
      return { type: "text", text: content.text, align: content.align, valign: content.valign, abbreviate: content.abbreviate };
    case "design":
      check(
        Array.isArray(content.layout) &&
          content.layout.length <= MAX.rows &&
          content.layout.every((r) => Array.isArray(r) && r.length <= MAX.cols && r.every((v) => Number.isInteger(v) && v >= 0 && v <= 71)),
        "Invalid design",
      );
      return { type: "design", layout: content.layout };
    case "widget": {
      check(content.widget in WIDGETS, "Unknown smart note type");
      const cfg = content.config ?? {};
      check(typeof cfg === "object", "Invalid settings");
      if (cfg.messages) check(Array.isArray(cfg.messages) && cfg.messages.length <= 100 && cfg.messages.every((m) => typeof m === "string" && m.length <= 500), "Invalid messages");
      if (cfg.prompt) check(typeof cfg.prompt === "string" && cfg.prompt.length <= 1000, "Prompt is too long");
      if (cfg.kinds !== undefined) check(Array.isArray(cfg.kinds) && cfg.kinds.every((k) => DAILY_KINDS.includes(k)), "Invalid mix types");
      if (content.widget === "mix") check(cfg.kinds === undefined || cfg.kinds.length > 0, "Pick at least one type for the mix.");
      if (cfg.date) check(parseDate(cfg.date), "Invalid countdown date");
      if (cfg.label) check(typeof cfg.label === "string" && cfg.label.length <= 60, "Label is too long");
      return {
        type: "widget",
        widget: content.widget as WidgetType,
        config: {
          source: cfg.source === "ai" ? "ai" : "curated",
          label: cfg.label,
          date: cfg.date,
          yearly: !!cfg.yearly,
          messages: cfg.messages,
          prompt: cfg.prompt,
          kinds: cfg.kinds ? DAILY_KINDS.filter((k) => cfg.kinds!.includes(k)) : undefined,
        },
      };
    }
    default:
      throw new ValidationError("Unknown content type");
  }
}

export function validateSchedule(s: unknown): Schedule {
  check(s && typeof s === "object", "Missing schedule");
  const schedule = s as Schedule;
  if (schedule.type === "once") {
    check(Number.isFinite(schedule.at), "Pick a date and time");
    return { type: "once", at: Math.floor(schedule.at) };
  }
  check(schedule.type === "recurring", "Unknown schedule type");
  check(Array.isArray(schedule.days) && schedule.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6), "Invalid days");
  check(Array.isArray(schedule.times) && schedule.times.length > 0, "Add at least one time");
  check(schedule.times.length <= 96 && schedule.times.every((t) => typeof t === "string" && parseTime(t)), "Invalid time");
  if (schedule.until) check(parseDate(schedule.until), "Invalid end date");
  return {
    type: "recurring",
    days: [...new Set(schedule.days)].sort(),
    times: [...new Set(schedule.times)].sort(),
    until: schedule.until || null,
  };
}

export function validateNoteInput(body: unknown): Required<Omit<NoteInput, "enabled">> & { enabled: boolean } {
  check(body && typeof body === "object", "Invalid request");
  const b = body as NoteInput;
  const hold = b.holdMinutes ?? 0;
  check(Number.isInteger(hold) && hold >= 0 && hold <= 24 * 60, "Invalid hold time");
  const schedule = validateSchedule(b.schedule);
  return {
    title: typeof b.title === "string" ? b.title.slice(0, 80) || null : null,
    content: validateContent(b.content),
    schedule,
    author: typeof b.author === "string" ? b.author.slice(0, 40) || null : null,
    // Only one-time notes can protect themselves from repeating notes.
    holdMinutes: schedule.type === "once" ? hold : 0,
    enabled: b.enabled !== false,
  };
}

export function validateSettings(body: unknown): SettingsUpdate {
  check(body && typeof body === "object", "Invalid request");
  const b = body as SettingsUpdate;
  const out: SettingsUpdate = {};
  if (b.boardType !== undefined) {
    check(b.boardType in BOARD_SIZES, "Invalid board type");
    out.boardType = b.boardType;
  }
  if (b.boardColor !== undefined) {
    check(b.boardColor === "black" || b.boardColor === "white", "Invalid board color");
    out.boardColor = b.boardColor;
  }
  if (b.apiType !== undefined) {
    check(b.apiType === "rw" || b.apiType === "cloud", "Invalid API type");
    out.apiType = b.apiType;
  }
  if (b.apiKey !== undefined && b.apiKey !== "") {
    check(typeof b.apiKey === "string" && b.apiKey.trim().length >= 8 && b.apiKey.length < 500, "That API key doesn't look right");
    out.apiKey = b.apiKey.trim();
  }
  if (b.timezone !== undefined) {
    check(typeof b.timezone === "string" && isValidTimeZone(b.timezone), "Unknown time zone");
    out.timezone = b.timezone;
  }
  if (b.location !== undefined) {
    check(
      b.location === null ||
        (typeof b.location.name === "string" && Math.abs(b.location.lat) <= 90 && Math.abs(b.location.lon) <= 180),
      "Invalid location",
    );
    out.location = b.location;
  }
  if (b.units !== undefined) {
    check(b.units === "f" || b.units === "c", "Invalid units");
    out.units = b.units;
  }
  for (const key of ["quietStart", "quietEnd"] as const) {
    if (b[key] !== undefined) {
      check(b[key] === null || b[key] === "" || parseTime(b[key]!), "Invalid quiet hours");
      out[key] = b[key] || null;
    }
  }
  return out;
}
