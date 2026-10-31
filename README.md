# Chunk History · Video Planner

A private planner for the channel's releases: one long video and three Shorts a week, an ideas list, and notes per video.
It runs free on Cloudflare, and only you can sign in. The plan is in [`PLAN.md`](PLAN.md).

![The calendar, November 2026](docs/calendar.png)

## What it does now

- **Calendar** with the weekly slots: Monday evergreen Short (from an older video), Tuesday long video, Thursday Short A,
  Saturday Short B. Click an empty slot to book a video or Short, or plan a new one by working title.
- **Monday suggestions:** each open Monday suggests an older video to make a Short from: one that fits the season first
  (spooky season, World Series, Black History Month…), otherwise the one promoted longest ago. Click *use* to accept.
- Each video has one status: **Idea → In progress → Ready → Published**.
- Sidebar: open long slots in the next 6 weeks, videos with no date yet, what's next, and upcoming seasons.
- **Backup** downloads everything as a file; **Restore** loads one back.
- Open it on your PC and your phone. Coming back to a tab picks up changes made on the other device, and a stale tab can't
  overwrite newer changes.

## Put it online (one-time, about 15 minutes, free)

Nothing below costs money. You'll end up with a private address like `https://chunk-planner.pages.dev`.

**1. Make a Cloudflare account** at https://dash.cloudflare.com/sign-up.

**2. Create the database.** In the Cloudflare dashboard: **Storage & Databases → D1 SQL Database → Create** (choose
"Create from scratch" if asked). Name it `chunk-planner`. Copy its **Database ID**, then either paste it to Claude, or open
`wrangler.toml` on GitHub, click the pencil, replace the `00000000-…` value of `database_id`, and commit.

**3. Create the site.** **Workers & Pages → Create → Pages → Connect to Git.** (If the page offers Workers first, look for the
Pages tab or "Get started" next to Pages.) Pick the `VideoPlanner` repository and the branch that holds the app
(`ccr-a7225c84-5fg71s` for now). Build settings: build command `npm run build`, output directory `dist`. Click
**Save and Deploy**.

When it finishes, open the address it gives you. You should see *"almost there: the planner is locked until Cloudflare Access is
set up"*. That's on purpose: your plans stay locked until step 4 is done.

**4. Lock it to you.** In the dashboard's left menu open **Zero Trust**. The first time, it asks for a **team name** (anything,
e.g. `chunkhistory`) and a plan: choose **Free**. (It may ask for a card for the free plan; the free plan isn't charged.)
Then:
- **Access → Applications → Add an application → Self-hosted.**
- Name: `Chunk Planner`. Add two public hostnames: the address from step 3 (`chunk-planner.pages.dev`) and
  `*.chunk-planner.pages.dev` (this covers preview versions).
- Add a policy: action **Allow**, include **Emails**, your email address. Leave the sign-in method as **One-time PIN**
  (Cloudflare emails you a code).
- Save. Open the application again and copy its **Application Audience (AUD) Tag**.

Paste the AUD tag and your team domain (`<team name>.cloudflareaccess.com`) to Claude, or put them in `wrangler.toml`
under `[vars]` yourself and commit. Cloudflare redeploys by itself; a minute later the address asks you to sign in, and then
shows your calendar.

Optional, for a second lock: in the Pages project, **Settings → Variables and Secrets → Add**, type **Secret**, name
`ALLOWED_EMAILS`, value your email. Then redeploy (Deployments → ⋯ → Retry deployment).

**After that,** every change pushed to that branch deploys by itself. The planner's data lives in the database, not in the
repo, so use **Backup** now and then.

> Preview versions (pushes to other branches) use the same database. Use Backup before trying one.

## Run it on your computer (optional, for development)

```bash
npm install
cp .dev.vars.example .dev.vars   # skips sign-in, on localhost only
npm run dev                      # opens on http://localhost:5173 with a local database
```

`data/seed.json` is the starting data, built from the style repo's catalog by `npm run seed -- ../15minhistorystyle`. It's
loaded into the database the first time the planner opens.
