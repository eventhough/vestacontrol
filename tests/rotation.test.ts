import { describe, expect, it } from "vitest";
import type { Settings } from "../src/worker/db";
import type { Env } from "../src/worker/env";
import { renderContent } from "../src/worker/render";

const settings = { boardType: "note", timezone: "America/New_York" } as Settings;
const content = { type: "widget" as const, widget: "rotation" as const, config: { messages: ["ONE", "", "TWO", "THREE"] } };
const run = (index?: number) => renderContent({} as Env, settings, content, index === undefined ? {} : { index });

describe("message rotation", () => {
  it("shows the next message each run and starts over after the last", async () => {
    expect((await run()).text).toBe("ONE");
    expect((await run()).state).toEqual({ index: 1 });
    expect((await run(1)).text).toBe("TWO");
    expect((await run(2)).text).toBe("THREE");
    expect((await run(2)).state).toEqual({ index: 0 });
  });

  it("copes with a list that got shorter since the last run", async () => {
    expect((await run(7)).text).toBe("TWO");
  });
});
