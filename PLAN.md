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
| The skill's phases: Packaging → Script → Content review → Pronunciation → Voice → Images → Scenes → Render → Feedback → Package → Classroom → Shorts, each ending at a checkpoint where you sign off | A **pipeline** with those exact phases and a "waiting on me" flag at each checkpoint |
| Series: Civil War (3), Reconstruction (3 parts), American West (4 episodes with a unit question and a Promise Ledger) | **Series** with an order, a unit question, and episodes that can be planned before they exist |
| Timely releases: Black Sox for the World Series, Mummies and Halloween for spooky season, Candy Scare | **Release windows** on the calendar (World Series, Halloween, holidays, school units), each with a "start by" date worked back from the production time |
| Thumbnails A/B/C, one marked ★; YouTube text with the 60-character title check; Test & Compare | **Packaging** on each video: concepts, the chosen one, title options, description, tags, title-length check |
| Shorts cut from a parent video, and a 48-hour results table (stayed to watch, avg viewed, views, note) | **Shorts** linked to their parent, with their own schedule and a **48-hour results log** that reminds you when it's due |
| Things waiting on you: Suno cues, Gemini images, "no renders until go-ahead" | A **"waiting on"** list per video (me / Claude / Suno / Gemini / voice credits) |
| The standing preferences (text inside SAFE=96, two subscribe plugs, no "AI" on screen, end screen ~20 s, tick altered-content box…) | A **pre-publish checklist** built from those rules, ticked per video |
| Each project's HANDOFF.md says where it stands | A **link to the project folder and handoff** on every video, so a new Claude session can be pointed at it |

---

## 2. The screens

1. **Pipeline board** (the home page). One column per phase, one card per video in production. A card shows the thumbnail
   (or the ★ concept), the working title, the target release date, days left, and a coral dot when it is waiting on you.
   Drag a card to move it to the next phase; the move is logged with the date so the app learns how long each phase takes.
2. **Release calendar.** Month and quarter views. Published videos, scheduled releases (with time), Shorts, and the release
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
            classroom (bool), quiet chapters (bool), tags[]
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

## 5. Tech (recommended)

- **Vite + React + TypeScript**: the same language as the Remotion projects, so components and the palette carry over.
- **Tailwind** with the palette as theme tokens; **dnd-kit** for dragging cards; a light calendar built in-house (the month
  grid is simple, and an off-the-shelf calendar would fight the look).
- **Data: a JSON file in this repo (`data/planner.json`) as the source of truth**, loaded and saved by the app:
  - Claude video sessions can update it at the end of a phase ("move Diamond Hoax to Render, waiting on: go-ahead"),
    the same way they write HANDOFF.md now.
  - History and backup come free with git.
  - Locally, `npm run dev` reads and writes the file through a tiny dev server; the hosted copy (GitHub Pages or Vercel) is
    read-only at first.
- **Later, if you want to edit from your phone:** move the data to Supabase (free tier) with sign-in for just you, keeping the
  JSON export.
- **Later still: YouTube Data API** (OAuth with your channel): pull published videos and stats, and set `publishAt` so
  scheduling in the app schedules the upload on YouTube.

---

## 6. Build order

| Step | Delivers | Size |
|---|---|---|
| 1 | Project setup, brand theme, the data file, **seed import** of all 20 videos, Shorts, the 3 series and the Diamond Hoax status from its HANDOFF | small |
| 2 | **Pipeline board** with drag between phases, phase history, "waiting on me" | medium |
| 3 | **Video page** (overview, production, notes) | medium |
| 4 | **Release calendar** with windows, drag to reschedule, cadence gaps | medium |
| 5 | Packaging tab (concepts with ★, title check), pre-publish checklist from the standing preferences | small |
| 6 | Series page and ideas backlog | small |
| 7 | Shorts tab and the 48-hour results log with reminders | small |
| 8 | Hosting, then optionally Supabase and the YouTube API | later |

Steps 1–4 make a useful app on their own: you can see what's in production, what's waiting on you, and what's going out when.

---

## 7. Questions to settle before building

1. **Cadence goal:** how often do you want to release (one long video a week? every two weeks?) and how many Shorts per
   long video? The calendar's gap warnings use this.
2. **Where you'll use it:** only on your computer (the JSON-in-repo plan is enough), or also on your phone (needs Supabase
   sooner)?
3. **YouTube connection:** do you want the app to actually schedule uploads on YouTube, or only to plan them?
4. **Classroom side:** should viewing guides and school units (e.g. the American West unit question) have their own view,
   or is a "classroom" tag on each video enough?
