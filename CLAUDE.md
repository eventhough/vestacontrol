# Vestacontrol: notes for Claude

Mobile web app for scheduling messages on a Vestaboard. Cloudflare Worker (Hono) + D1 + React/Vite. See README.md for the architecture and deploy setup.

## Layout
- `src/shared/`: code used by both the browser and the Worker. `characters.ts` (Vestaboard char codes, board sizes), `formatter.ts` (text → layout with word wrap and smart abbreviation), `abbreviations.ts`, `schedule.ts` (timezone-aware next-run math), `types.ts` (API types).
- `src/worker/`: `index.ts` (API routes + cron entry), `scheduler.ts` (runs every minute and sends at most one due note per tick), `render.ts` (content/widgets → layout), `vestaboard.ts` (API client), `db.ts`, `auth.ts`, `validate.ts`, `ai.ts` (optional Claude), `content.ts` (built-in quotes and so on).
- `src/client/`: React app. `screens/` (one per tab), `components/`, `state.tsx` (hash routing + app context), `api.ts`.
- `migrations/`: D1 schema. Add a new numbered file for schema changes; never edit applied ones.

## Conventions
- All times are stored as UTC ms. Users enter wall-clock times in the board's configured timezone; convert with `localToUtc` / `utcToLocalTime` from `src/shared/schedule.ts`.
- A layout is `number[][]` (rows × cols) of character codes. The Note is 3×15 and the Flagship is 6×22.
- Validate all request bodies in `src/worker/validate.ts`.

## Before pushing
Run `npm run check` (typecheck + vitest + build). Pushing to `main` deploys via `.github/workflows/deploy.yml`.
