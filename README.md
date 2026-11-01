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

## Claude ideas (connect once)

The **Ideas** tab's *Brainstorm* button asks Claude for video ideas that fit the channel: each comes with the concept, a
hook, three titles (with character counts), a thumbnail headline, why now, and what archival images likely exist. Claude
sees your list of videos and saved ideas, so it doesn't repeat them. It uses Claude Opus 5.5; a brainstorm costs roughly
10–20 cents. If a request is ever declined by a safety check, it's retried automatically on a suitable fallback model.

To connect it:
1. Go to https://platform.claude.com and sign in (a separate account from your Claude subscription is fine; API use is
   billed separately).
2. **Billing:** add a few dollars of credit. Optional but wise: under **Limits**, set a monthly spend limit (e.g. $10).
3. **API keys → Create key**, name it `chunk-planner`, and copy it (it's shown only once).
4. In Cloudflare, open the **chunk-planner** Worker → **Settings → Variables and Secrets → Add**. Type **Secret**, name
   `ANTHROPIC_API_KEY`, paste the key, and save/deploy.

The key stays inside Cloudflare; the browser never sees it. Don't paste it into chat or into a file in the repo.

## Run it on your computer (optional, for development)

```bash
npm install
cp .dev.vars.example .dev.vars   # skips sign-in, on localhost only
npm run dev                      # opens on http://localhost:5173 with a local database
```

`data/seed.json` is the starting data, built from the style repo's catalog by `npm run seed -- ../15minhistorystyle`. It's
loaded into the database the first time the planner opens.
