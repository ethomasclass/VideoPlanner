// Builds data/seed.json (the planner's starting data) from the style repo's video catalog (videos/README.md).
// Usage: node scripts/seed.mjs ../15minhistorystyle [--force]
// Refuses to overwrite an existing data/seed.json unless --force is given.
import fs from 'node:fs';
import path from 'node:path';

const styleRepo = process.argv[2];
const force = process.argv.includes('--force');
if (!styleRepo) {
  console.error('Usage: node scripts/seed.mjs <path to 15minhistorystyle> [--force]');
  process.exit(1);
}
const out = path.resolve('data/seed.json');
if (fs.existsSync(out) && !force) {
  console.error(`${out} already exists. Pass --force to overwrite it.`);
  process.exit(1);
}

const readme = fs.readFileSync(path.join(styleRepo, 'videos/README.md'), 'utf8');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- long videos from the catalog table -------------------------------------------------
const videos = [];
for (const line of readme.split('\n')) {
  const m = line.match(/^\| (\d+) \| (.+?) \| ([\d:]+) \| (.+?) \| ([\d,—-]+) \| (.+?) \| (.+?) \|$/);
  if (!m) continue;
  const [, num, rawTitle, runtime, , , repo] = m;
  const clean = rawTitle.replace(/\*/g, '').trim();
  // A trailing "(…)" is a note, not part of the title: "Redemption (Reconstruction, Part 3)".
  const paren = /\s*\(([^()]*)\)\s*$/;
  const notes = [];
  const take = (s) => s.replace(paren, (_, n) => (notes.push(n), '')).trim();
  const [rawHead, ...rest] = clean.split(':');
  const head = take(rawHead);
  const subtitle = take(rest.join(':')) || undefined;
  const project = repo.match(/projects\/[^`)\s]+/)?.[0]?.replace(/\/$/, '');
  videos.push({
    id: slug(head).slice(0, 40),
    kind: 'long',
    number: Number(num),
    title: head.trim(),
    subtitle,
    status: 'published',
    runtime,
    projectPath: project,
    notes: notes.join('; ') || undefined,
  });
}

// ---- hand-curated details the table doesn't carry ---------------------------------------
const byNum = (n) => videos.find((v) => v.number === n);
const set = (n, patch) => Object.assign(byNum(n) ?? {}, patch);

const series = [
  { id: 'civil-war', name: 'Civil War' },
  { id: 'reconstruction', name: 'Reconstruction' },
  {
    id: 'american-west',
    name: 'The American West after the Civil War',
    unitQuestion:
      'To what extent did the United States fulfill its promises of freedom and opportunity after the Civil War?',
  },
];

set(12, { seriesId: 'civil-war', episode: 1, seasons: ['black-history'] });
set(16, { seriesId: 'civil-war', episode: 2, seasons: ['black-history'] });
set(17, { seriesId: 'civil-war', episode: 3, seasons: ['black-history'] });
set(13, { seriesId: 'reconstruction', episode: 1, seasons: ['black-history'] });
set(14, { seriesId: 'reconstruction', episode: 2, seasons: ['black-history'] });
set(15, { seriesId: 'reconstruction', episode: 3, seasons: ['black-history'] });
set(18, { seriesId: 'american-west', episode: 1 });
set(4, { seasons: ['black-history'] });
set(3, { seasons: ['presidents'] });
set(5, { seasons: ['halloween'] });
set(6, { seasons: ['world-series'] });
set(8, { seasons: ['halloween'] });
set(9, { seasons: ['halloween'] });
set(10, { seasons: ['d-day'] });
set(11, { seasons: ['election', 'presidents'] });
set(19, {
  title: 'Trick-or-Treating Was a Bribe',
  subtitle: 'The Real History of Halloween',
  seasons: ['halloween'],
});

// ---- in production ----------------------------------------------------------------------
videos.push(
  {
    id: 'diamond-hoax',
    kind: 'long',
    number: 20,
    title: "They Fooled America's Richest Men",
    subtitle: 'The Great Diamond Hoax of 1872 (on screen: PAID FOR DIRT)',
    status: 'in-progress',
    runtime: '~15:45',
    projectPath: 'projects/Diamond_Hoax',
    notes:
      'All 9 chapters built; only ch 1 rendered. Waiting on 8 Suno cues and your go-ahead for the full render. Thumbnail H1 chosen.',
  },
  {
    id: 'cheaper-than-dirt',
    kind: 'long',
    title: 'Cheaper Than Dirt',
    subtitle: 'Cattle, Gold, and the End of the Open Range',
    seriesId: 'american-west',
    episode: 2,
    status: 'in-progress',
    projectPath: 'projects/American_West/ep2',
  },
  {
    id: 'free-land',
    kind: 'long',
    title: 'Free Land',
    subtitle: 'Homesteaders, Exodusters, and the Edge of the Rain',
    seriesId: 'american-west',
    episode: 3,
    status: 'in-progress',
    notes: 'Outline ready: projects/American_West/EP3_PLAINS_FARMING_OUTLINE.md',
  },
  {
    id: 'absolute-and-undisturbed',
    kind: 'long',
    title: 'Absolute and Undisturbed',
    subtitle: 'The Plains Nations and the Promises on Paper',
    seriesId: 'american-west',
    episode: 4,
    status: 'in-progress',
    notes: 'Outline ready: projects/American_West/EP4_PLAINS_NATIONS_OUTLINE.md',
  },
);

// ---- Shorts made as their own projects ---------------------------------------------------
const shorts = [
  ['The Last Public Execution', 'projects/Last_Public_Hanging', 'published'],
  ['Rumpelstiltskin', 'projects/Rumpelstiltskin_Short', 'published'],
  ['World Series', 'projects/World_Series_Short', 'published', ['world-series']],
  ['Pledge Salute', 'projects/Pledge_Salute_Short', 'published'],
  ['Candy Scare', 'projects/Candy_Scare', 'published', ['halloween']],
  ['The Last Time America Was Debt Free', 'projects/Last_Time_Debt_Free_Short', 'in-progress'],
  ['Recession Indicators', 'projects/Recession_Indicators_Short', 'in-progress'],
];
for (const [title, projectPath, status, seasons] of shorts) {
  videos.push({ id: 'short-' + slug(title), kind: 'short', title, projectPath, status, seasons });
}
// The Halloween video's two Shorts (review/Shorts.md)
for (const t of ['Trick or Treat Was a Bribe', 'The First Jack-o\'-Lanterns Were Turnips']) {
  videos.push({
    id: 'short-' + slug(t),
    kind: 'short',
    title: t,
    parentId: byNum(19)?.id,
    status: 'published',
    seasons: ['halloween'],
  });
}

const planner = {
  version: 1,
  settings: {
    cadence: [
      { kind: 'evergreen', label: 'Evergreen Short', weekday: 1, time: '12:00' },
      { kind: 'long', label: 'Long video', weekday: 2, time: '15:00' },
      { kind: 'shortA', label: 'Short A', weekday: 4, time: '12:00' },
      { kind: 'shortB', label: 'Short B', weekday: 6, time: '12:00' },
    ],
  },
  series,
  videos,
  releases: [],
  windows: [
    { id: 'black-history', name: 'Black History Month', start: '02-01', end: '02-28' },
    { id: 'presidents', name: "Presidents' Day", start: '02-10', end: '02-20' },
    { id: 'd-day', name: 'D-Day anniversary', start: '05-30', end: '06-06' },
    { id: 'july-4', name: 'Fourth of July', start: '06-27', end: '07-04' },
    { id: 'halloween', name: 'Spooky season', start: '10-01', end: '10-31' },
    { id: 'world-series', name: 'World Series', start: '10-20', end: '11-03' },
    { id: 'election', name: 'Election Day', start: '11-01', end: '11-07' },
    { id: 'thanksgiving', name: 'Thanksgiving', start: '11-20', end: '11-28' },
  ],
  ideas: [],
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(planner, null, 2) + '\n');
console.log(`Wrote ${out}: ${videos.length} videos (${videos.filter((v) => v.kind === 'long').length} long).`);
