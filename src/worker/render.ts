// Turns a note's content (text, a hand-made design, or a smart widget) into a board layout.

import { BOARD_SIZES, BoardType, Layout, normalizeLayout } from "../shared/characters";
import { formatText } from "../shared/formatter";
import { parseDate, utcToLocalDate, zonedParts } from "../shared/schedule";
import type { NoteContent, WidgetConfig, WidgetType } from "../shared/types";
import { AI_PROMPTS, generateBoardText } from "./ai";
import { FACTS, JOKES, QUESTIONS, QUOTES } from "./content";
import type { Settings } from "./db";
import type { Env } from "./env";

export interface WidgetState {
  index?: number;
  recent?: string[];
}

export interface Rendered {
  layout: Layout;
  state?: WidgetState;
  /** Plain-text version, for history and AI de-duplication. */
  text?: string;
}

interface Ctx {
  board: BoardType;
  env: Env;
  settings: Settings;
  rows: number;
  cols: number;
  now: number;
  state: WidgetState;
}

export class RenderError extends Error {}

export async function renderContent(env: Env, settings: Settings, content: NoteContent, state: WidgetState = {}, now = Date.now()): Promise<Rendered> {
  const board = settings.boardType;
  const { rows, cols } = BOARD_SIZES[board];
  if (content.type === "design") return { layout: normalizeLayout(content.layout, rows, cols) };
  if (content.type === "text") {
    const r = formatText(content.text, { board, rows, cols, align: content.align, valign: content.valign, abbreviate: content.abbreviate ?? 2 });
    return { layout: r.layout, text: content.text };
  }
  return renderWidget(content.widget, content.config ?? {}, { env, settings, board, rows, cols, now, state });
}

function fit(ctx: Ctx, text: string, abbreviate = 2) {
  return formatText(text, { board: ctx.board, rows: ctx.rows, cols: ctx.cols, abbreviate });
}

function fitsBoard(ctx: Ctx, text: string): boolean {
  return fit(ctx, text).fits;
}

async function renderWidget(widget: WidgetType, config: WidgetConfig, ctx: Ctx): Promise<Rendered> {
  switch (widget) {
    case "weather":
      return weather(ctx);
    case "quote":
    case "question":
    case "joke":
    case "fact":
      return ofTheDay(widget, config, ctx);
    case "countdown":
      return countdown(config, ctx);
    case "date":
      return dateGreeting(ctx);
    case "rotation":
      return rotation(config, ctx);
    case "ai":
      return askClaude(config, ctx);
  }
}

// ---------- of the day ----------

const LISTS = { quote: QUOTES, question: QUESTIONS, joke: JOKES, fact: FACTS };
const HEADERS = { quote: "", question: "QUESTION OF THE DAY", joke: "", fact: "FUN FACT" };

async function ofTheDay(kind: keyof typeof LISTS, config: WidgetConfig, ctx: Ctx): Promise<Rendered> {
  const recent = ctx.state.recent ?? [];
  let text: string | null = null;
  let index = ctx.state.index ?? 0;

  if (config.source === "ai" && ctx.env.ANTHROPIC_API_KEY) {
    try {
      const generated = await generateBoardText(ctx.env, AI_PROMPTS[kind], ctx.board, recent);
      if (fitsBoard(ctx, generated)) text = generated;
    } catch (e) {
      console.warn(`AI ${kind} failed, falling back to built-in list`, e);
    }
  }
  if (!text) {
    const list = LISTS[kind].filter((t) => fitsBoard(ctx, t));
    if (list.length === 0) throw new RenderError("No built-in content fits this board.");
    text = list[index % list.length];
    index = (index + 1) % list.length;
  }

  const header = HEADERS[kind];
  const withHeader = header ? `${header}\n\n${text}` : text;
  const shown = header && fit(ctx, withHeader, 1).fits ? withHeader : text;
  return { layout: fit(ctx, shown).layout, text, state: { index, recent: [text, ...recent].slice(0, 10) } };
}

// ---------- weather ----------

const WEATHER: [number[], string, string][] = [
  [[0], "SUNNY", "yellow"],
  [[1, 2], "PT CLOUDY", "yellow"],
  [[3], "CLOUDY", "white"],
  [[45, 48], "FOG", "white"],
  [[51, 53, 55, 56, 57], "DRIZZLE", "blue"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "RAIN", "blue"],
  [[71, 73, 75, 77, 85, 86], "SNOW", "white"],
  [[95, 96, 99], "STORMS", "violet"],
];

function describeWeather(code: number): { label: string; color: string } {
  const hit = WEATHER.find(([codes]) => codes.includes(code));
  return hit ? { label: hit[1], color: hit[2] } : { label: "", color: "white" };
}

interface Forecast {
  current: { temperature_2m: number; weather_code: number };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
    weather_code: number[];
  };
}

async function weather(ctx: Ctx): Promise<Rendered> {
  const loc = ctx.settings.location;
  if (!loc) throw new RenderError("Set your location in Settings to use the weather forecast.");
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    temperature_unit: ctx.settings.units === "c" ? "celsius" : "fahrenheit",
    timezone: ctx.settings.timezone,
    forecast_days: "2",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new RenderError(`Weather service returned ${res.status}`);
  const f = (await res.json()) as Forecast;

  const now = describeWeather(f.current.weather_code);
  const t = Math.round(f.current.temperature_2m);
  const hi = Math.round(f.daily.temperature_2m_max[0]);
  const lo = Math.round(f.daily.temperature_2m_min[0]);
  const rain = f.daily.precipitation_probability_max[0] ?? 0;
  const tmrw = describeWeather(f.daily.weather_code[1]);
  // The Note has no degree sign (its code 62 is a heart), so temperatures are bare numbers there.
  const deg = ctx.board === "flagship" ? "°" : "";

  const lines =
    ctx.rows >= 6
      ? [
          loc.name.split(",")[0],
          `{${now.color}} NOW ${t}${deg} ${now.label}`,
          `HI ${hi}${deg} LO ${lo}${deg}`,
          `RAIN ${rain}%`,
          `TMRW ${Math.round(f.daily.temperature_2m_max[1])}${deg}/${Math.round(f.daily.temperature_2m_min[1])}${deg} ${tmrw.label}`,
        ]
      : [`{${now.color}} ${t}${deg} ${now.label}`, `HI ${hi}${deg} LO ${lo}${deg}`, `RAIN ${rain}%`];
  const text = lines.join("\n");
  return { layout: fit(ctx, text, 1).layout, text };
}

// ---------- countdown ----------

function countdown(config: WidgetConfig, ctx: Ctx): Rendered {
  const label = (config.label || "THE BIG DAY").toUpperCase();
  const target = config.date ? parseDate(config.date) : null;
  if (!target) throw new RenderError("Pick a date for the countdown.");
  const today = parseDate(utcToLocalDate(ctx.now, ctx.settings.timezone))!;
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  let targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  if (config.yearly) {
    targetUtc = Date.UTC(today.year, target.month - 1, target.day);
    if (targetUtc < todayUtc) targetUtc = Date.UTC(today.year + 1, target.month - 1, target.day);
  }
  const days = Math.round((targetUtc - todayUtc) / 86_400_000);

  let text: string;
  if (days === 0) text = `{green} TODAY IS {green}\n${label}!`;
  else if (days === 1) text = `${label}\nIS TOMORROW!`;
  else if (days > 0) text = `${days} DAYS UNTIL\n${label}`;
  else text = `${label}\nWAS ${-days} DAYS AGO`;
  return { layout: fit(ctx, text).layout, text };
}

// ---------- date ----------

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUNE", "JULY", "AUG", "SEPT", "OCT", "NOV", "DEC"];

function dateGreeting(ctx: Ctx): Rendered {
  const p = zonedParts(ctx.now, ctx.settings.timezone);
  const greeting = p.hour < 5 ? "GOOD NIGHT" : p.hour < 12 ? "GOOD MORNING" : p.hour < 17 ? "GOOD AFTERNOON" : p.hour < 22 ? "GOOD EVENING" : "GOOD NIGHT";
  const date = `${DAYS[p.weekday]}\n${MONTHS[p.month - 1]} ${p.day}`;
  const stripe = "{red}{orange}{yellow}{green}{blue}{violet}";
  const text = ctx.rows >= 6 ? `${stripe}\n${greeting}\n\n${date}, ${p.year}\n${stripe}` : `${greeting}\n${date}`;
  return { layout: fit(ctx, text, 1).layout, text };
}

// ---------- rotation ----------

function rotation(config: WidgetConfig, ctx: Ctx): Rendered {
  const messages = (config.messages ?? []).map((m) => m.trim()).filter(Boolean);
  if (messages.length === 0) throw new RenderError("Add at least one message to the rotation.");
  const index = (ctx.state.index ?? 0) % messages.length;
  const text = messages[index];
  return { layout: fit(ctx, text).layout, text, state: { index: (index + 1) % messages.length } };
}

// ---------- ask Claude ----------

async function askClaude(config: WidgetConfig, ctx: Ctx): Promise<Rendered> {
  const prompt = config.prompt?.trim();
  if (!prompt) throw new RenderError("Write a prompt for Claude.");
  if (!ctx.env.ANTHROPIC_API_KEY) throw new RenderError("Claude isn't set up. Add the ANTHROPIC_API_KEY secret to enable it.");
  const recent = ctx.state.recent ?? [];
  let text = await generateBoardText(ctx.env, prompt, ctx.board, recent);
  if (!fitsBoard(ctx, text)) {
    text = await generateBoardText(ctx.env, `${prompt}\n\nKeep it shorter: it must fit ${ctx.rows} lines of ${ctx.cols} characters.`, ctx.board, recent);
  }
  return { layout: fit(ctx, text, 3).layout, text, state: { recent: [text, ...recent].slice(0, 10) } };
}
