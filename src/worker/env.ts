export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Optional: enables "Ask Claude" and AI-written quotes/questions. Set with `wrangler secret put ANTHROPIC_API_KEY`. */
  ANTHROPIC_API_KEY?: string;
  /** Testing only: send Vestaboard API calls to a mock server instead of Vestaboard's cloud. */
  VESTABOARD_API_URL?: string;
}
