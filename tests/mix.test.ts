import { describe, expect, it } from "vitest";
import { formatText } from "../src/shared/formatter";
import { JOKES as ALL_JOKES, QUOTES as ALL_QUOTES, WORDS as ALL_WORDS } from "../src/worker/content";
import type { Settings } from "../src/worker/db";
import type { Env } from "../src/worker/env";
import { renderContent, type WidgetState } from "../src/worker/render";
import { ValidationError, validateContent } from "../src/worker/validate";
import type { DailyKind } from "../src/shared/types";

// The app skips built-in items that don't fit the board, so compare against the ones that fit a Note.
const fitsNote = (t: string) => formatText(t, { board: "note", rows: 3, cols: 15 }).fits;
const [JOKES, QUOTES, WORDS] = [ALL_JOKES, ALL_QUOTES, ALL_WORDS].map((l) => l.filter(fitsNote));

const settings = { boardType: "note", timezone: "America/New_York" } as Settings;
const mix = (kinds?: DailyKind[]) => ({ type: "widget" as const, widget: "mix" as const, config: { kinds } });

async function runs(kinds: DailyKind[] | undefined, n: number): Promise<string[]> {
  let state: WidgetState = {};
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await renderContent({} as Env, settings, mix(kinds), state);
    out.push(r.text!);
    state = r.state!;
  }
  return out;
}

describe("smart mix", () => {
  it("takes turns between the chosen types, each continuing its own list", async () => {
    expect(await runs(["word", "joke"], 4)).toEqual([JOKES[0], WORDS[0], JOKES[1], WORDS[1]]);
  });

  it("uses the fixed type order regardless of how they were picked", async () => {
    expect(await runs(["word", "quote"], 2)).toEqual([QUOTES[0], WORDS[0]]);
  });

  it("uses all five types when none are specified", async () => {
    const texts = await runs(undefined, 5);
    expect(new Set(texts).size).toBe(5);
    expect(texts[0]).toBe(QUOTES[0]);
  });

  it("rejects an empty or unknown selection", () => {
    expect(() => validateContent(mix([]))).toThrow(ValidationError);
    expect(() => validateContent(mix(["nope" as DailyKind]))).toThrow(ValidationError);
    expect((validateContent(mix(["word", "quote"])) as { config: { kinds: DailyKind[] } }).config.kinds).toEqual(["quote", "word"]);
  });
});
