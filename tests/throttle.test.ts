import { describe, expect, it } from "vitest";
import { clientKey, describeWait, lockoutAfter } from "../src/worker/throttle";

const req = (ip?: string) => new Request("https://x/", { headers: ip ? { "CF-Connecting-IP": ip } : {} });

describe("lockoutAfter", () => {
  it("allows a few free mistakes, then doubles the lockout up to a day", () => {
    expect([1, 2, 3, 4].map(lockoutAfter)).toEqual([0, 0, 0, 0]);
    expect(lockoutAfter(5)).toBe(5 * 60_000);
    expect(lockoutAfter(6)).toBe(10 * 60_000);
    expect(lockoutAfter(7)).toBe(20 * 60_000);
    expect(lockoutAfter(50)).toBe(24 * 60 * 60_000);
  });
});

describe("clientKey", () => {
  it("uses the IPv4 address as-is", () => {
    expect(clientKey(req("203.0.113.7"))).toBe("203.0.113.7");
  });
  it("groups IPv6 addresses by /64 network", () => {
    expect(clientKey(req("2001:db8:abcd:12:1:2:3:4"))).toBe("2001:db8:abcd:12::/64");
    expect(clientKey(req("2001:DB8:ABCD:0012::99"))).toBe("2001:db8:abcd:12::/64");
    expect(clientKey(req("2001:db8::1"))).toBe("2001:db8:0:0::/64");
  });
  it("falls back when the header is missing", () => {
    expect(clientKey(req())).toBe("unknown");
  });
});

describe("describeWait", () => {
  it("rounds up to minutes or hours", () => {
    expect(describeWait(1)).toBe("1 minute");
    expect(describeWait(5 * 60_000)).toBe("5 minutes");
    expect(describeWait(80 * 60_000)).toBe("2 hours");
  });
});
