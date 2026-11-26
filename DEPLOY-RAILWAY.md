# Deploy Alongside on Railway

Alongside runs as **one Railway service**. It serves the website and, on the same address:

| Path | What it is |
| --- | --- |
| `/` | The website (built from `site/`) |
| `/api/*` | Breeze chat, Find care, judges' showcase (`api/worker.mjs`) |
| `/calendar/*` | Calendar subscription feeds (`calendar/worker.mjs`) |
| `/reminders/*` | WhatsApp reminders, off until configured (`reminders/worker.mjs`) |
| `/healthz` | Health check used by Railway |

Data (rate limits, chat sessions, calendar feeds, the showcase) is stored in SQLite on a Railway volume.
No packages are installed: it uses Node 24's built-in SQLite.

## 1. Create the service

1. In Railway: **New Project → Deploy from GitHub repo** → choose `hintofhala21/alongside` and the branch to deploy.
2. Railway finds `railway.json` and builds with the `Dockerfile`. The build runs the checks and all tests, then builds the site.
   If a test fails, the deploy stops and the current version stays live.
3. **Settings → Networking → Generate Domain** to get a public `https://…up.railway.app` address.

## 2. Attach a volume (keeps data between deploys)

**Service → Add Volume**, mount path `/data`. The server finds it automatically.
Without a volume, everything stored resets on each deploy (calendar links stop working, rate limits reset).

Keep the service at **one replica**. SQLite lives on one volume, so more replicas would not share data.

## 3. Variables

Set these under **Service → Variables**. Never put them in the repository.

| Variable | Required | Value |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Your OpenAI project key |
| `AI_ENABLED` | Yes | `true` (set `false` to switch Breeze off instantly) |
| `RATE_SALT` | Yes | A long random string. Keep it the same between deploys, or everyone is signed out of chat |
| `DEMO_ACCESS_CODE` | Yes | Code for the competition demo mode |
| `PUBLISHER_CODE` | Yes | Separate code for publishing demos to the judges' page |
| `GOOGLE_PLACES_API_KEY` | No | Turns on the nearest-first hospital list in Find care. Without it, Find care links to Google Maps |
| `OPENAI_MODEL` | No | Defaults to `gpt-6-luna` |
| `MAX_DAILY_REQUESTS` / `MAX_MONTHLY_REQUESTS` / `MAX_SESSION_REQUESTS` | No | Spending limits. Defaults 60 / 500 / 30 |
| `PUBLIC_ORIGIN` | Only with a custom domain | e.g. `https://alongside.example.com`. Otherwise the Railway domain is used automatically |
| `WA_*` | No | WhatsApp sender settings, see `reminders/README.md`. WhatsApp stays off without them |

To make a random value on your computer: `openssl rand -hex 32`.

## 4. Check it after deploying

1. Open `https://<your-domain>/healthz` → `{"ok":true}`.
2. Open `https://<your-domain>/api/status` → `"ready":true` means Breeze is on.
3. Open the site, create a profile, send Breeze one message, open Find care, and try it on a phone.

## Run the same server on your computer

```sh
npm run build
PORT=8080 AI_ENABLED=true OPENAI_API_KEY=… RATE_SALT=… DEMO_ACCESS_CODE=… PUBLISHER_CODE=… npm start
```

Then open http://localhost:8080. Data is kept in `.data/` (ignored by git).

## Notes

- The old Cloudflare Workers (`*/wrangler.jsonc`) and the GitHub Pages site keep running until you turn them off.
  GitHub Actions now only checks changes; it no longer publishes to Pages.
- Calendar links made on the old site point at Cloudflare. People need to subscribe again from the Railway site.
