# Chunk History · Video Planner

A private planner for the channel's releases: one long video and three Shorts a week, an ideas list, and notes per video.
It runs free on Cloudflare (a Worker with a D1 database), and only you can sign in. The plan is in [`PLAN.md`](PLAN.md).

![The calendar, November 2026](docs/calendar.png)

## What it does now

- **Calendar** with the weekly slots: Monday evergreen Short (from an older video), Tuesday long video, Thursday Short A,
  Saturday Short B. Click an empty slot to book a video or Short, or plan a new one by working title.
- **Monday suggestions:** each open Monday suggests an older video to make a Short from: one that fits the season first
  (spooky season, World Series, Black History Month…), otherwise the one promoted longest ago. Click *use* to accept.
- Each video has one status: **Idea → In progress → Ready → Published**.
- Sidebar: open long slots in the next 6 weeks, videos with no date yet, what's next, and upcoming seasons.
- **Seasons** tab: add your own seasons (Christmas, Women's History Month…), change dates (they repeat yearly and can run
  over New Year), rename, hide from the calendar, or delete. Tag the videos that fit each season: during it, they come
  first in the Monday suggestions, and Claude aims its ideas at seasons coming up.
- **Ideas:** save your own ideas or brainstorm them with Claude; star favourites; *Plan it* turns an idea into a video,
  on an open calendar slot or with no date yet.
- **Thumbnails first:** every idea leads with its thumbnail (a mock of the concept in the channel's style, or a real
  image). Claude's brainstorm pictures the thumbnail before writing titles, and *Thumbnails → ask Claude for 5 concepts*
  gives one idea several different thumbnail + title pairs. Upload images from your phone or PC (shrunk to 1280×720
  automatically) and ★ the one you're using; it shows on the calendar. Videos on the calendar have the same thumbnail panel
  when you tap them.
- **Backup** downloads everything as a file; **Restore** loads one back.
- Open it on your PC and your phone. Coming back to a tab picks up changes made on the other device, and a stale tab can't
  overwrite newer changes.

## Put it online (one-time, about 15 minutes, free)

Nothing below costs money. You'll end up with a private address like `https://chunk-planner.<you>.workers.dev`.

**1. Make a Cloudflare account** at https://dash.cloudflare.com/sign-up.

**2. Create the database** (done): **Storage & databases → D1 SQL database → Create database**, named `chunk-planner`. Its
ID is in `wrangler.toml`.

**3. Create the Worker** (done): **Compute → Workers & Pages → Create → Import a repository**, the `VideoPlanner` repo,
branch `ccr-a7225c84-5fg71s`. Build command `npm run build`; deploy command `npx wrangler deploy` (the default). The
Worker's name must be `chunk-planner`, the same as `name` in `wrangler.toml`.

When it deploys, open the Worker's address (on its page, under **Domains & Routes** or **Visit**). You should see *"almost
there: the planner is locked until Cloudflare Access is set up"*. That's on purpose: your plans stay locked until step 4.

**4. Lock it to you.**
- On the Worker's page: **Settings → Domains & Routes**. Next to the `workers.dev` address, open the **⋯** menu (or the
  toggle) and choose **Enable Cloudflare Access**. If Cloudflare asks you to set up Zero Trust first, pick a **team name**
  (anything, e.g. `chunkhistory`) and the **Free** plan. (It may ask for a card; the free plan isn't charged.)
- Open **Zero Trust → Access → Applications** and click the new application for the Worker. Under its policy, make sure only
  **your email** is allowed (Include → Emails). Sign-in method: **One-time PIN** (Cloudflare emails you a code).
- On that application's page, copy the **Application Audience (AUD) Tag**.

Paste the AUD tag and your team domain (`<team name>.cloudflareaccess.com`, shown under **Zero Trust → Settings**) to
Claude, or put them in `wrangler.toml` under `[vars]` yourself and commit. Cloudflare redeploys by itself; a minute later the
address asks you to sign in, and then shows your calendar.

Optional, for a second lock: on the Worker, **Settings → Variables and Secrets → Add**, type **Secret**, name
`ALLOWED_EMAILS`, value your email.

**After that,** every change pushed to that branch deploys by itself. The planner's data lives in the database, not in the
repo, so use **Backup** now and then. (Backup saves your plans, ideas and thumbnail concepts; uploaded images stay in the
database and aren't in the backup file.)

## YouTube stats (connect once, free)

The **Stats** tab shows your channel's public numbers from YouTube (subscribers, total views, and every upload with its
date, real thumbnail, length, views, views per day, likes and comments), refreshed every hour by the Worker. Uploads link to
the videos in your planner: confident matches link themselves and are marked published on the day they went live; the rest
wait in *Link to your planner* (pick a video, add it as a new one, or ignore it). Linked videos show their real thumbnail
and view count on the calendar, and past uploads fill in the calendar's history. For uploads the planner sees while new, it
records views at 48 hours. The AI brainstorm also sees which videos do best.

To connect it:
1. Open https://console.cloud.google.com and pick or create a project (e.g. *chunk-planner*).
2. **APIs & Services → Library**, search **YouTube Data API v3**, click **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. (Optional: restrict it to YouTube Data API v3.)
4. In Cloudflare: the **chunk-planner** Worker → **Settings → Variables and Secrets → Add**, type **Secret**, name
   `YOUTUBE_API_KEY`, paste the key, save. The channel is set in `wrangler.toml` (`YOUTUBE_HANDLE`).

Watch time, retention and click-through rate need YouTube Analytics (sign-in with your channel), a later step.

## AI ideas (connect once)

The **Ideas** tab's *Brainstorm* button and *ask … for 5 concepts* use an AI: **Gemini** (free tier) or **Claude** (paid
API). Add one key as a Worker secret; if both are set, Claude is used. Without a key, everything else in the planner still
works and those buttons explain how to connect.

Each brainstorm gives ideas thumbnail first (headline, setup line, what's in the picture, paired title), then the concept,
a hook, three titles, why now, and what archival images exist. The AI sees your videos and saved ideas, so it doesn't
repeat them. A brainstorm takes about a minute.

**Gemini (free tier):**
1. Go to https://aistudio.google.com, sign in with Google, and choose **Get API key → Create API key**.
2. In Cloudflare, open the **chunk-planner** Worker → **Settings → Variables and Secrets → Add**. Type **Secret**, name
   `GEMINI_API_KEY`, paste the key, and save/deploy.

Uses `gemini-flash-latest`; to use another model add a variable `GEMINI_MODEL` (e.g. `gemini-pro-latest`). The free tier has
rate and daily limits (the app says so if you hit one), and Google may use free-tier prompts to improve its products.

**Claude (paid API, separate from a Claude subscription):** create a key at https://platform.claude.com (add a few dollars
of credit; set a monthly limit under **Limits**), then add it the same way as a Secret named `ANTHROPIC_API_KEY`. Uses
Claude Opus 5.5, roughly 10–20 cents a brainstorm; a request declined by a safety check is retried on a fallback model.

Keys stay inside Cloudflare; the browser never sees them. Don't paste a key into chat or into a file in the repo.

## Run it on your computer (optional, for development)

```bash
npm install
cp .dev.vars.example .dev.vars   # skips sign-in, on localhost only
npm run dev                      # opens on http://localhost:5173 with a local database
```

`data/seed.json` is the starting data, built from the style repo's catalog by `npm run seed -- ../15minhistorystyle`. It's
loaded into the database the first time the planner opens.
