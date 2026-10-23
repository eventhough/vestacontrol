// Sign-in throttling, per client rather than global, so someone guessing
// passwords locks out only themselves. The first few mistakes are free; after
// that each failure locks that client out for twice as long as the last.

import type { Env } from "./env";

export const FREE_ATTEMPTS = 4;
const FIRST_LOCK_MS = 5 * 60_000;
const MAX_LOCK_MS = 24 * 60 * 60_000;
/** A client that hasn't failed for this long starts over. */
const FORGET_AFTER_MS = 24 * 60 * 60_000;

/** How long to lock a client out after its Nth consecutive failure. */
export function lockoutAfter(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  return Math.min(FIRST_LOCK_MS * 2 ** (failures - FREE_ATTEMPTS - 1), MAX_LOCK_MS);
}

function expandIPv6(ip: string): string[] {
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  return ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
}

/** Identifies the client. IPv6 users usually control a whole /64, so we count that network, not one address. */
export function clientKey(req: Request): string {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!ip.includes(":")) return ip;
  return `${expandIPv6(ip.toLowerCase()).slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

interface Row {
  failures: number;
  locked_until: number;
  updated_at: number;
}

async function get(env: Env, client: string, now: number): Promise<Row | null> {
  const row = await env.DB.prepare("SELECT failures, locked_until, updated_at FROM login_attempts WHERE client = ?").bind(client).first<Row>();
  return row && now - row.updated_at < FORGET_AFTER_MS ? row : null;
}

/** Milliseconds until this client may try again, or 0 if it may try now. */
export async function lockedFor(env: Env, client: string, now = Date.now()): Promise<number> {
  const row = await get(env, client, now);
  return row ? Math.max(0, row.locked_until - now) : 0;
}

/** Records a wrong password and returns how long the client is now locked out (0 if not). */
export async function recordFailure(env: Env, client: string, now = Date.now()): Promise<number> {
  const failures = ((await get(env, client, now))?.failures ?? 0) + 1;
  const lock = lockoutAfter(failures);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO login_attempts (client, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(client) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at`,
    ).bind(client, failures, now + lock, now),
    env.DB.prepare("DELETE FROM login_attempts WHERE updated_at < ?").bind(now - FORGET_AFTER_MS),
  ]);
  return lock;
}

export async function clearFailures(env: Env, client: string): Promise<void> {
  await env.DB.prepare("DELETE FROM login_attempts WHERE client = ?").bind(client).run();
}

export function describeWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
