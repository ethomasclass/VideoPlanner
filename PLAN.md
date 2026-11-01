# Chunk History Video Planner: plan

A private, simple planner for Chunk History releases. It is for setting your own schedule, keeping ideas, and seeing what
goes out when. Production details stay in the video projects and their HANDOFF files; the planner only needs titles, dates,
status and notes.

## Decisions (Oct 31, 2026)

- **A planner, not a production tracker.** One status per video: Idea → In progress → Ready → Published.
- **In the cloud, free:** a Cloudflare Worker (the site and its API), D1 (the database), Access (sign-in, only you). Works on PC and phone.
- **AI for ideas:** Gemini's free tier (GEMINI_API_KEY) or Claude's paid API (ANTHROPIC_API_KEY, preferred when set).
- **YouTube uploads: not now.** Scheduling in YouTube Studio takes a couple of minutes; revisit once the planner is a habit.
- **No classroom features.**

## Cadence: one long video and three Shorts a week

| Day (editable) | Slot | What goes in it |
|---|---|---|
| Monday | Evergreen Short | A Short from an older video, pointing back to it |
| Tuesday | Long video | This week's video |
| Thursday | Short A | The new video's strongest Short |
| Saturday | Short B | Its second Short |

- Three Shorts a week is sustainable; one long video a week needs about three videos in the works at once and a couple
  finished ahead before you commit to it publicly.
- The back catalog gives about 20 weeks of Monday Shorts. The planner rotates through it and pulls seasonal ones forward.
- Build Shorts native, not cut down: *The Last Public Execution* (people first, no early text) kept 55% of viewers; the
  cut-down *Banned → Partner* kept 12%.
- Series run on consecutive Tuesdays.

## The app

1. **Calendar** (done): weekly slots, book or plan videos and Shorts, Monday suggestions, seasons, open-slot warnings.
2. **Ideas list + Claude** (done): save ideas, put one on the calendar in a click. A *Brainstorm* button asks Claude for ideas
   for a month, theme or season (concept, hook, 3 titles, a thumbnail headline, why now), using the channel's own rules: a
   question or paradox in 2–4 words, "would I click at 11 PM?", hook first, no modern politicians. Also: upcoming round-number
   anniversaries, and hooks for Monday Shorts. The API key is stored as a Cloudflare secret, never in the browser.
3. **Thumbnails first** (done): thumbnail concepts lead every idea; Claude brainstorms thumbnail-first and can give 5
   concepts per idea; upload images from phone or PC; the chosen one shows on the calendar.
4. **Seasons** (done): add, edit, hide and delete seasons; tag the videos that fit each one.
5. **YouTube stats, level 1** (done): public stats synced hourly, auto-linking uploads to planner videos, real
   thumbnails and views on the calendar, 48-hour views, best posting day; brainstorms see what does best.
6. **Schedule editor and idea planning pages** (done).
7. **YouTube Analytics, level 2** (done): sign-in with the channel; watch time, % viewed, subscribers, US + Canada share;
   best posting day for North American viewers by Eastern-time weekday.
8. **Video page** (next): titles (YouTube and on-screen), thumbnail ideas, status, notes, its Shorts, project folder.
9. **Later, maybe:** impressions and CTR from YouTube's Reporting API; YouTube upload scheduling, a nightly backup into the repo.

## How it's built

- Vite + React + TypeScript, in the channel's look (the dark desk, Abril Fatface on orange tape, Nanum Pen notes, teal for
  anything clickable, coral only for what needs attention).
- One Cloudflare Worker (`worker/index.ts`) serves the app and `/api/planner` (`worker/planner.ts`), which loads and saves the whole planner as one JSON document in one D1
  row. Every save carries the revision it was based on; a stale tab gets "changed on another device" instead of overwriting.
- `worker/access.ts` verifies the Cloudflare Access sign-in token on every API request, so the data stays private
  even if Access were switched off by mistake. Until Access is configured, the API refuses everything.
- Starting data (`data/seed.json`) comes from the style repo's catalog via `scripts/seed.mjs`.
