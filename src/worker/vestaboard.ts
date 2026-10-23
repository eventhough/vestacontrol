// Talks to Vestaboard's cloud APIs. Two kinds of credentials work:
//  - "rw":    Read/Write API key (Vestaboard app → Settings → Developer → Read / Write API)
//  - "cloud": Cloud API token (web.vestaboard.com → Developer → API)
// Both accept a raw character-code layout, which works for the Note (3x15) and Flagship (6x22).

import type { Layout } from "../shared/characters";
import type { ApiType } from "../shared/types";

const ENDPOINTS: Record<ApiType, { url: string; header: string }> = {
  rw: { url: "https://rw.vestaboard.com/", header: "X-Vestaboard-Read-Write-Key" },
  cloud: { url: "https://cloud.vestaboard.com/", header: "X-Vestaboard-Token" },
};

export class VestaboardError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function describe(status: number, body: string): string {
  if (status === 401 || status === 403) return "Vestaboard rejected the API key. Double-check it in Settings.";
  if (status === 429) return "Vestaboard is rate limiting (max ~1 message every 15 seconds). Try again shortly.";
  return `Vestaboard returned ${status}${body ? `: ${body.slice(0, 200)}` : ""}`;
}

export async function sendLayout(apiType: ApiType, apiKey: string, layout: Layout, baseUrl?: string): Promise<void> {
  const { header } = ENDPOINTS[apiType];
  const url = baseUrl || ENDPOINTS[apiType].url;
  const body = apiType === "rw" ? JSON.stringify(layout) : JSON.stringify({ characters: layout });
  const res = await fetch(url, {
    method: "POST",
    headers: { [header]: apiKey, "Content-Type": "application/json" },
    body,
  });
  // 304/409: the board is already showing this exact message. Not an error for us.
  if (res.ok || res.status === 304 || res.status === 409) return;
  throw new VestaboardError(describe(res.status, await res.text().catch(() => "")), res.status);
}

/** Reads what's currently on the board. Returns null if the API returns something we don't recognize. */
export async function readLayout(apiType: ApiType, apiKey: string, baseUrl?: string): Promise<Layout | null> {
  const { header } = ENDPOINTS[apiType];
  const url = baseUrl || ENDPOINTS[apiType].url;
  const res = await fetch(url, { headers: { [header]: apiKey } });
  if (!res.ok) throw new VestaboardError(describe(res.status, await res.text().catch(() => "")), res.status);
  return extractLayout(await res.json().catch(() => null));
}

function isLayout(v: unknown): v is Layout {
  return Array.isArray(v) && v.length > 0 && v.every((row) => Array.isArray(row) && row.every((c) => typeof c === "number"));
}

/** The APIs have used a few shapes over time ({currentMessage:{layout:"[[...]]"}}, {layout:[[...]]}, ...). */
export function extractLayout(data: unknown): Layout | null {
  if (isLayout(data)) return data;
  if (typeof data === "string") {
    try {
      return extractLayout(JSON.parse(data));
    } catch {
      return null;
    }
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["currentMessage", "layout", "characters", "message"]) {
      if (key in o) {
        const found = extractLayout(o[key]);
        if (found) return found;
      }
    }
  }
  return null;
}
