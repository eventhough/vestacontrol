import { describe, expect, it } from "vitest";
import { inQuietHours, localToUtc, nextRun, runsBetween, utcToLocalTime, describeSchedule } from "../src/shared/schedule";

const NY = "America/New_York";

describe("timezones", () => {
  it("converts wall-clock time to UTC", () => {
    expect(new Date(localToUtc("2026-07-04", "08:00", NY)!).toISOString()).toBe("2026-07-04T12:00:00.000Z");
    expect(new Date(localToUtc("2026-12-25", "08:00", NY)!).toISOString()).toBe("2026-12-25T13:00:00.000Z");
  });

  it("rolls forward through the spring-forward gap", () => {
    const at = localToUtc("2026-03-08", "02:30", NY)!;
    expect(utcToLocalTime(at, NY)).toBe("03:30");
  });

  it("picks the first 1:30 on fall-back day", () => {
    expect(new Date(localToUtc("2026-11-01", "01:30", NY)!).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("nextRun", () => {
  const weekdays7 = { type: "recurring" as const, days: [1, 2, 3, 4, 5], times: ["07:00", "18:30"] };

  it("finds the next time on the same day", () => {
    const fri6am = localToUtc("2026-10-23", "06:00", NY)!;
    expect(nextRun(weekdays7, fri6am, NY)).toBe(localToUtc("2026-10-23", "07:00", NY));
  });

  it("skips the weekend", () => {
    const fri7pm = localToUtc("2026-10-23", "19:00", NY)!;
    expect(nextRun(weekdays7, fri7pm, NY)).toBe(localToUtc("2026-10-26", "07:00", NY));
  });

  it("is strictly after the given time", () => {
    const at = localToUtc("2026-10-23", "07:00", NY)!;
    expect(nextRun(weekdays7, at, NY)).toBe(localToUtc("2026-10-23", "18:30", NY));
  });

  it("stops after until", () => {
    const s = { ...weekdays7, until: "2026-10-23" };
    expect(nextRun(s, localToUtc("2026-10-23", "19:00", NY)!, NY)).toBeNull();
  });

  it("handles one-off notes", () => {
    expect(nextRun({ type: "once", at: 1000 }, 500, NY)).toBe(1000);
    expect(nextRun({ type: "once", at: 1000 }, 1000, NY)).toBeNull();
  });

  it("lists runs in a window", () => {
    const from = localToUtc("2026-10-23", "00:00", NY)!;
    const to = localToUtc("2026-10-30", "00:00", NY)!;
    expect(runsBetween(weekdays7, from, to, NY)).toHaveLength(10);
  });
});

describe("quiet hours", () => {
  it("wraps past midnight", () => {
    expect(inQuietHours(localToUtc("2026-10-23", "23:00", NY)!, NY, "22:00", "07:00")).toBe(true);
    expect(inQuietHours(localToUtc("2026-10-23", "06:59", NY)!, NY, "22:00", "07:00")).toBe(true);
    expect(inQuietHours(localToUtc("2026-10-23", "07:00", NY)!, NY, "22:00", "07:00")).toBe(false);
    expect(inQuietHours(localToUtc("2026-10-23", "12:00", NY)!, NY, null, null)).toBe(false);
  });
});

describe("describeSchedule", () => {
  it("summarizes", () => {
    expect(describeSchedule({ type: "recurring", days: [1, 2, 3, 4, 5], times: ["07:00"] })).toBe("Weekdays at 7:00 AM");
    expect(describeSchedule({ type: "recurring", days: [], times: ["18:30"] })).toBe("Every day at 6:30 PM");
  });
});
