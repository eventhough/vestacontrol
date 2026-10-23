# Vestacontrol

A mobile web app for scheduling notes, designs and daily surprises on your **Vestaboard Note** or **Vestaboard Flagship**, built for the whole household. There are no user accounts: everyone shares one household password.

## Features

- **Timeline** of everything coming up, plus a live view of what's on the board right now
- **Message composer** with a live board preview. It uppercases, word-wraps and centers your text, and **automatically shortens words** (TOMORROW → TMRW, BIRTHDAY → BDAY, AND → &) only when the message wouldn't otherwise fit. You choose how aggressive it gets: Off / Natural / Texting / Max.
- **Design editor**: paint tiles with any Vestaboard color, letter or symbol, or switch to *Type* mode and type straight onto the grid. Includes undo, fill and clear. Color emoji like 🟥 💙 work in messages too.
- **Scheduling**: send now, at a specific time, or repeating (pick days, several times a day, "every hour between…", and an optional end date)
- **Smart notes** that are generated fresh each time they're sent:
  - 🌤️ Weather forecast (free [Open-Meteo](https://open-meteo.com), no key needed)
  - 💬 Quote of the day, ❓ question of the day, 😄 joke, 💡 fun fact
  - ⏳ Countdown ("12 DAYS UNTIL DISNEY TRIP"), with yearly repeat for birthdays and holidays
  - 📅 Good morning + date
  - 🔁 Message rotation (cycles through your own list)
  - ✨ Ask Claude (optional): write any prompt and Claude writes content sized to fit your board
- **Edit, pause or delete** any note; one-tap **quick ideas** for common repeating notes
- **Quiet hours**: repeating notes won't flip the board overnight
- **"Keep on board for at least…"**: so a birthday message isn't replaced 10 minutes later by the hourly weather
- **Favorites** for reusing designs and messages
- **History** of everything sent (or failed or skipped), with "send again"
- **"From"** name on notes, so everyone knows who left the message
- Installable on your phone's home screen (PWA)

## How it works

```
Phone browser ──▶ Cloudflare Worker (API + static React app)
                        │   ▲
                        ▼   │ cron: every minute
                   Cloudflare D1 (SQLite) ──▶ Vestaboard cloud API
```

- **Frontend**: React + Vite (`src/client`)
- **Backend**: a Cloudflare Worker using Hono (`src/worker`). A cron trigger runs every minute, sends any note that's due, and advances repeating schedules.
- **Shared logic** (`src/shared`) such as the text formatter, abbreviations, character codes and timezone-aware scheduling runs in both the browser (live preview) and the Worker.
- **Database**: Cloudflare D1. Schema lives in `migrations/`.

**Why Cloudflare?** For one household it's **free**. The Workers free tier includes cron triggers that run every minute (which this app needs for on-time scheduling), and D1 includes a free SQLite database. Vercel's free plan only runs cron jobs once a day, and DigitalOcean starts at about $5/month.

## Deploy (one-time setup, about 10 minutes)

Once this is set up, every push to `main` deploys automatically through GitHub Actions.

1. **Create a free Cloudflare account** at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Create an API token**: go to *My Profile → API Tokens → Create Token*, then pick the **"Edit Cloudflare Workers"** template. Under *Permissions*, add **Account → D1 → Edit**. Create the token and copy it.
3. **Find your Account ID**: it's shown in the right sidebar of the Workers & Pages overview page in the Cloudflare dashboard.
4. **Add GitHub secrets**: in this repo, go to *Settings → Secrets and variables → Actions → New repository secret* and add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `ANTHROPIC_API_KEY` *(optional; enables the ✨ Claude features. Get one at [console.anthropic.com](https://console.anthropic.com))*
5. **Push to `main`** (or merge a PR). The workflow creates the database, applies migrations and deploys. Your app goes live at `https://vestacontrol.<your-subdomain>.workers.dev`. The URL appears in the workflow logs and in the Cloudflare dashboard.
6. **Open it on your phone** and the setup wizard walks you through creating the household password, choosing your board, connecting the Vestaboard API, and setting your time zone and location.

> Visit the site soon after the first deploy. The first person to open it creates the household password.

**Custom domain (optional):** in the Cloudflare dashboard, open *Workers & Pages → vestacontrol → Settings → Domains & Routes*.

### Getting your Vestaboard API key

Use either option. Both work for the Note and the Flagship.

- **Read/Write API key** (simplest): in the Vestaboard app, go to *Settings → Developer → Read / Write API*, enable it and copy the key.
- **Cloud API token**: at [web.vestaboard.com](https://web.vestaboard.com), open your board and go to *Developer → API*, then create a token.

Paste it into the setup wizard (or *Settings → Connection* later) and tap **Test connection**.

## Develop locally

```bash
npm install
npm run dev        # API on :8787 (local D1, local cron) + Vite on :5173
```

Open http://localhost:5173. The local database lives in `.wrangler/`.

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run check` | typecheck + tests + build (same as CI) |
| `npm test` | unit tests (formatter, scheduling, validation) |
| `curl "localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"` | run the scheduler once, locally |

To test without a real board, run any HTTP server that mimics the Vestaboard API and put `VESTABOARD_API_URL=http://127.0.0.1:9999/` in `.dev.vars`. To try the Claude features locally, add `ANTHROPIC_API_KEY=...` there too. `.dev.vars` is git-ignored.

## Ideas for later

- Push notifications to family members when a note goes up
- Calendar sync (Google or iCloud) to auto-post today's events
- Sports scores, stock prices, sunrise/sunset or air quality widgets
- "Reply" flow: ask a question of the day and collect family answers in the app
- Animated transitions using Vestaboard's VBML
- Holiday design packs (pumpkins in October, hearts in February…)
