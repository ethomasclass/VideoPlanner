# Chunk History Video Planner: plan

A web app to plan, track and schedule Chunk History releases: long-form videos, series episodes and Shorts, from the first
idea to the 48-hour Shorts check. It is built around how the channel already works (the 12-phase workflow in the
`15-minute-history` skill, the catalog in `15minhistorystyle/videos/README.md`, the HANDOFF.md files), not around a generic
to-do list.

---

## 1. What the app has to handle (taken from the style repo)

| What the repo shows | What the app needs |
|---|---|
| 20 long videos plus about 15 Shorts, each with runtime, chapters, word count, repo and branch, ending line | A **Video** record with those fields, seeded from `videos/README.md` |
| The skill's phases: Packaging → Script → Content review → Pronunciation → Voice → Images → Scenes → Render → Feedback → Package → Shorts, each ending at a checkpoint where you sign off | A **pipeline** with those exact phases and a "waiting on me" flag at each checkpoint |
| Series: Civil War (3), Reconstruction (3 parts), American West (4 episodes with a unit question and a Promise Ledger) | **Series** with an order, a unit question, and episodes that can be planned before they exist |
| Timely releases: Black Sox for the World Series, Mummies and Halloween for spooky season, Candy Scare | **Release windows** on the calendar (World Series, Halloween, holidays, school units), each with a "start by" date worked back from the production time |
| Thumbnails A/B/C, one marked ★; YouTube text with the 60-character title check; Test & Compare | **Packaging** on each video: concepts, the chosen one, title options, description, tags, title-length check |
| Shorts cut from a parent video, and a 48-hour results table (stayed to watch, avg viewed, views, note) | **Shorts** linked to their parent, with their own schedule and a **48-hour results log** that reminds you when it's due |
| Things waiting on you: Suno cues, Gemini images, "no renders until go-ahead" | A **"waiting on"** list per video (me / Claude / Suno / Gemini / voice credits) |
| The standing preferences (text inside SAFE=96, two subscribe plugs, no "AI" on screen, end screen ~20 s, tick altered-content box…) | A **pre-publish checklist** built from those rules, ticked per video |
| Each project's HANDOFF.md says where it stands | A **link to the project folder and handoff** on every video, so a new Claude session can be pointed at it |

---

## 2. The screens

1. **Pipeline board.** One column per phase, one card per video in production. A card shows the thumbnail
   (or the ★ concept), the working title, the target release date, days left, and a coral dot when it is waiting on you.
   Drag a card to move it to the next phase; the move is logged with the date so the app learns how long each phase takes.
2. **Release calendar** (the home page). Month and quarter views, with the weekly cadence slots (section 5). Published videos, scheduled releases (with time), Shorts, and the release
   windows as shaded bands. A cadence line shows gaps ("nothing scheduled for 3 weeks"). Drag a video to reschedule.
3. **Video page.** Everything for one video, in tabs:
   - *Overview:* titles (YouTube title vs. on-screen title), series and episode, phase, target date, runtime goal, repo path,
     handoff link, what it's waiting on.
   - *Packaging:* thumbnail concepts with the ★, title options with the 60-char check, description, chapters, tags.
   - *Production:* the phase checklist with checkpoint dates; voice/images/music status lines like the HANDOFF table.
   - *Pre-publish checklist:* the standing-preferences list.
   - *Shorts:* its Shorts, each with a hook, schedule, and the 48-hour results.
   - *Notes:* your feedback notes per round (the "take each note literally" log).
4. **Series page.** The episode table (like `SERIES.md`): order, working title, years, the promise being tested, phase,
   release date. Unit question at the top.
5. **Ideas backlog.** One-line concept, a "would I click at 11 PM?" score, season fit (e.g. "October"), archival images
   available yes/no, rough length. Promote an idea to a video with one click.
6. **Results.** The Shorts 48-hour table and, later, YouTube stats per video (views, average view duration, CTR) next to which
   thumbnail and title won.

---

## 3. Data model

```
Series      id, name, unitQuestion, closer, color?, episodes → Video[]
Video       id, kind (long | short), number, youtubeTitle, screenTitle, subtitle, years,
            seriesId?, episode?, parentVideoId? (Shorts),
            phase, phaseHistory [{phase, enteredAt}], waitingOn [{who, what, since}],
            targetRelease, scheduledAt?, publishedAt?, youtubeId?, window?,
            runtimeGoal, runtime?, chapters?, words?, endingLine?,
            repo, branch, projectPath, handoffPath,
            quiet chapters (bool), tags[]
Packaging   videoId, concepts [{label, file, headline, chosen}], titles [{text, chosen}],
            description, chapters text, tags[]
Checklist   videoId, items [{ruleId, done}]          (rules come from one shared list)
ShortResult videoId, stayedPct, avgViewed, views, note, loggedAt
Idea        id, concept, clickScore, season, imagesAvailable, notes
Window      id, name, start, end, recurring (yearly)  (World Series, Halloween, Black History Month…)
```

---

## 4. Brand

The app should look like the channel: the dark desk.

- Background: the desk gradient (`#2a2620 → #16140f → #0d0c09`) with the faint 64 px ruling.
- Page and section titles: **Abril Fatface** caps on torn orange (`#FF9F1C`) tape strips, tilted about −2°, ink type.
- Notes and empty states: **Nanum Pen Script** in teal, lowercase ("nothing scheduled yet, the desk is clear").
- Dates, counters, phase labels: **IBM Plex Mono** caps, 1 px tracking. Body: **Inter**.
- Colour jobs carry over: **teal** = anything you can click or that is drawn (links, the "today" line, drag handles);
  **orange** = titles only; **coral** = the one thing that needs attention (the next release, a card waiting on you). Phases
  use neutral tones, not a rainbow, so coral stays meaningful.
- The Chunk mark (`brand/chunk-history/final/chunk-history-mark-teal.svg`) as the logo and favicon.
- `brand/palette.css` and the font files are copied in directly, so the app and the videos share one source.

---

## 5. Decisions (Oct 31, 2026)

- **Used on one PC only.** Runs locally (`npm run dev`, opens in the browser). No hosting, no sign-in, no Supabase.
- **Purpose: your own schedule, plans and release calendar.** The calendar is the centre of the app; the pipeline board feeds it.
- **Claude built in for ideas.**
- **Upload automation as an option** (off until you connect your channel).
- **No classroom or viewing-guide features.**

### Cadence: one long video and three Shorts a week

| Day (default, editable) | Slot | What goes in it |
|---|---|---|
| Tuesday | **Long video** | This week's video |
| Thursday | **Short A** | The new video's strongest Short |
| Saturday | **Short B** | Its second Short |
| Monday | **Evergreen Short** | A Short from an older video, linked to that video |

Thoughts on it:
- **Three Shorts a week is a good number;** one long video a week is the hard part. Each video goes through about 12 phases with sign-offs,
  so weekly only works with **three videos in production at once** at staggered phases (one being scripted, one being built, one
  being rendered and packaged), plus a **buffer of two finished videos** before you commit to the schedule publicly. The app shows
  the buffer ("2 weeks banked") and warns when it drops to zero.
- **Evergreen Shorts are a free win:** 19 finished long videos are 19 weeks of Monday Shorts without starting anything new. The app
  rotates through the back catalog (the video resurfaced longest ago comes next) and pulls seasonal ones to the front: the Halloween
  and Mummies videos in October, World Series and Black Sox in October, Reconstruction in February.
- **Build Shorts native, not cut down.** Your own results say so: *The Last Public Execution* (people first, no early text) kept
  55% of viewers; the cut-down *Banned → Partner* kept 12%. The app's Short card asks for the opening frame and the first line.
- **Series run on consecutive weeks** (American West Ep 2–4 on three Tuesdays in a row), and the calendar keeps them together when
  you move one.
- Days and times are settings. Pick them from YouTube Studio's "When your viewers are on YouTube" card.

## 6. Claude for ideas

A small local server calls the Claude API (Anthropic TypeScript SDK, Claude Opus 5.5, structured JSON output). It needs an
Anthropic API key in `.env`; API use is billed separately from a Claude subscription and costs cents per brainstorm. Every request
carries your channel context: the list of videos so far, the packaging rules (a question or paradox in 2–4 words, "would I click at
11 PM?"), the script rules (hook first, no modern politicians), and what's already on the calendar.

- **Brainstorm ideas:** "give me 10 ideas for November" (or for a theme, a season, or "like Diamond Hoax") → each idea has the
  concept in one line, the hook, 3 titles, a thumbnail headline, why now (an anniversary or season), and whether archival images
  are likely to exist. Save any to the backlog with one click.
- **Anniversaries:** upcoming round-number anniversaries (100th, 150th…) of events that fit the channel, for timely slots.
- **Title and thumbnail punch-up** for a video already in the pipeline.
- **Short hooks** for an evergreen Short from an older video (from its script, if the project path is set).
- **Fill the gaps:** looks at empty slots and the backlog and proposes what goes where. You accept or ignore each suggestion.

## 7. Upload automation (optional)

Through the YouTube Data API, after a one-time Google sign-in for your channel:

1. On the video's page, **Upload** picks up the files the production session already makes: the master MP4 from `renders/`, the
   ★ thumbnail, and the title, description, chapters and tags from `review/YouTube_description.md` (the app reads that file's
   `## Title` / `## Description` blocks). Shorts use `renders/shorts/` and `review/Shorts.md`.
2. It uploads the video as **private with a scheduled publish time** (the calendar slot), sets the thumbnail, and sets the
   **altered-content flag** (your standing rule). YouTube then publishes it on time on its own.
3. The video's page shows the YouTube link and status, and the calendar slot turns to "scheduled on YouTube".

Before relying on it, know two things:
- **One-time Google setup** (about 20 minutes, a walkthrough goes in the README): a Google Cloud project with the YouTube API turned
  on and an OAuth client for a desktop app.
- **YouTube locks uploads from unverified API projects to private.** Until the project passes YouTube's API audit (a form, free,
  can take a few weeks), uploaded videos can't go public. So the first version uploads as private + scheduled and tells you if
  YouTube has locked it; you can still switch it to scheduled in Studio by hand. Applying for the audit early removes this.
- The free daily API quota covers this cadence comfortably.

## 8. Tech

- **Vite + React + TypeScript** for the app, and a small **Express** server in the same project (it runs the app, reads and writes
  the data, holds the API keys, and does the uploads). One command: `npm run dev`.
- **Data in `data/planner.json`**, committed to this repo, so Claude video sessions can update a video's phase at the end of a
  session the same way they write HANDOFF.md, and git keeps the history.
- Plain CSS with the channel palette as variables; the fonts are self-hosted from the style repo.
- Settings and secrets (API keys, Google tokens) live in `.env` and `data/.secrets/`, both git-ignored.

## 9. Build order

| Step | Delivers |
|---|---|
| 1 | Setup, brand theme, data file, starting data (all videos, series, the projects in production), **release calendar with cadence slots**, assigning videos and Shorts to slots |
| 2 | Pipeline board with phases, "waiting on", buffer count |
| 3 | Video page (overview, packaging, notes, Shorts) |
| 4 | Evergreen rotation and seasonal pull-forward; series kept together |
| 5 | Claude: brainstorm, anniversaries, title punch-up, Short hooks, fill the gaps |
| 6 | YouTube: connect the channel, scheduled upload of videos and Shorts, status back into the calendar |
| 7 | Results: Shorts 48-hour log and stats pulled from YouTube |
