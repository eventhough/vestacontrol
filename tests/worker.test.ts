import { describe, expect, it } from "vitest";
import { extractLayout } from "../src/worker/vestaboard";
import { ValidationError, validateNoteInput, validateSettings } from "../src/worker/validate";

describe("extractLayout", () => {
  const layout = [[1, 2], [3, 4]];
  it("handles the Read/Write API shape (layout as a JSON string)", () => {
    expect(extractLayout({ currentMessage: { layout: JSON.stringify(layout), id: "x" } })).toEqual(layout);
  });
  it("handles raw arrays and nested objects", () => {
    expect(extractLayout(layout)).toEqual(layout);
    expect(extractLayout({ currentMessage: { characters: layout } })).toEqual(layout);
  });
  it("returns null for unknown shapes", () => {
    expect(extractLayout({ foo: 1 })).toBeNull();
    expect(extractLayout(null)).toBeNull();
  });
});

describe("validation", () => {
  const base = { content: { type: "text", text: "hi" }, schedule: { type: "once", at: 1 } };
  it("accepts a valid note and normalizes repeating schedules", () => {
    const v = validateNoteInput({ ...base, schedule: { type: "recurring", days: [5, 1, 1], times: ["18:00", "07:00"] } });
    expect(v.schedule).toEqual({ type: "recurring", days: [1, 5], times: ["07:00", "18:00"], until: null });
  });
  it("rejects bad input", () => {
    expect(() => validateNoteInput({ ...base, content: { type: "text", text: "  " } })).toThrow(ValidationError);
    expect(() => validateNoteInput({ ...base, content: { type: "design", layout: [[99]] } })).toThrow(ValidationError);
    expect(() => validateNoteInput({ ...base, schedule: { type: "recurring", days: [], times: ["7am"] } })).toThrow(ValidationError);
    expect(() => validateSettings({ timezone: "Mars/Olympus" })).toThrow(ValidationError);
  });
});
