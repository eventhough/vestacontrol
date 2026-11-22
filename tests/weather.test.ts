import { describe, expect, it } from "vitest";
import { layoutToText } from "../src/shared/characters";
import { formatText } from "../src/shared/formatter";
import { weatherText, type Forecast } from "../src/worker/render";

const NOTE = { board: "note" as const, rows: 3, cols: 15 };
const FLAGSHIP = { board: "flagship" as const, rows: 6, cols: 22 };
const CODES = [0, 2, 3, 45, 61, 71, 95];

function forecast(code: number, hi = 58, lo = 41, rain: number | null = 20): Forecast {
  return {
    current: { temperature_2m: 50, weather_code: 3 },
    daily: { temperature_2m_max: [60, hi], temperature_2m_min: [45, lo], precipitation_probability_max: [5, rain], weather_code: [3, code] },
  };
}

const render = (text: string, ctx: typeof NOTE | typeof FLAGSHIP) => formatText(text, { ...ctx, abbreviate: 1 });

describe("tomorrow's weather", () => {
  it("shows tomorrow's forecast on the Note", () => {
    const text = weatherText(forecast(0), "tomorrow", "Oakland", NOTE);
    expect(text).toBe("{yellow} TMRW SUNNY\nHI 58 LO 41\nRAIN 20%");
    expect(layoutToText(render(text, NOTE).layout).split("\n").map((l) => l.trim())).toEqual(["■ TMRW SUNNY", "HI 58 LO 41", "RAIN 20%"]);
  });

  it("drops the color tile when the condition is too long for a Note row", () => {
    expect(weatherText(forecast(2), "tomorrow", "Oakland", NOTE).split("\n")[0]).toBe("TMRW PT CLOUDY");
  });

  it("shows the place and degree signs on the Flagship", () => {
    expect(weatherText(forecast(61, 48, 39, 80), "tomorrow", "Oakland", FLAGSHIP)).toBe("Oakland\n{blue} TOMORROW RAIN\nHI 48° LO 39°\nRAIN 80%");
  });

  it("fits every condition and extreme temperatures on both boards", () => {
    for (const ctx of [NOTE, FLAGSHIP])
      for (const code of CODES)
        for (const [hi, lo] of [[105, 88], [-12, -25]]) {
          const text = weatherText(forecast(code, hi, lo, 100), "tomorrow", "San Francisco", ctx);
          expect(render(text, ctx).fits, `${ctx.board} ${text}`).toBe(true);
        }
  });

  it("leaves today's forecast as it was", () => {
    expect(weatherText(forecast(0), "today", "Oakland", NOTE)).toBe("{white} 50 CLOUDY\nHI 60 LO 45\nRAIN 5%");
  });
});
