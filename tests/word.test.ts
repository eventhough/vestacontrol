import { describe, expect, it } from "vitest";
import { layoutToText } from "../src/shared/characters";
import { formatText } from "../src/shared/formatter";
import { WORDS } from "../src/worker/content";
import type { Settings } from "../src/worker/db";
import type { Env } from "../src/worker/env";
import { renderContent } from "../src/worker/render";

const content = { type: "widget" as const, widget: "word" as const, config: {} };

describe("word of the day", () => {
  it("every built-in word fits the Note without shortening, word on its own line", () => {
    for (const w of WORDS) {
      const r = formatText(w, { board: "note", rows: 3, cols: 15, abbreviate: 0 });
      expect(r.fits, w).toBe(true);
      expect(layoutToText(r.layout).split("\n")[0].trim(), w).toBe(w.split("\n")[0]);
    }
  });

  it("shows the next word each run", async () => {
    const settings = { boardType: "note", timezone: "America/New_York" } as Settings;
    const first = await renderContent({} as Env, settings, content, {});
    const second = await renderContent({} as Env, settings, content, first.state);
    expect(first.text).toBe(WORDS[0]);
    expect(second.text).toBe(WORDS[1]);
  });

  it("adds a header on the Flagship", async () => {
    const settings = { boardType: "flagship", timezone: "America/New_York" } as Settings;
    const r = await renderContent({} as Env, settings, content, {});
    expect(layoutToText(r.layout)).toContain("WORD OF THE DAY");
    expect(layoutToText(r.layout)).toContain("SERENDIPITY");
  });
});
