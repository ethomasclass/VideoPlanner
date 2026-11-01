import type { Planner, Video, YouTubeData, YTVideo } from '../types.ts';
import { toISO } from './dates.ts';

export async function fetchYouTube(sync = false): Promise<YouTubeData> {
  const res = await fetch(sync ? '/api/youtube/sync' : '/api/youtube', { method: sync ? 'POST' : 'GET' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

/** The local calendar day a video went live. */
export const ytDay = (v: YTVideo) => toISO(new Date(v.publishedAt));
export const ytUrl = (v: YTVideo) => (v.isShort ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`);
export const perDay = (v: YTVideo) => v.views / Math.max(1, (Date.now() - Date.parse(v.publishedAt)) / 864e5);
export const compact = (n: number | undefined | null) =>
  n == null ? '–' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

// ---- matching YouTube uploads to planner videos ----

const STOP = new Set(
  'the and how why what who was were that this with for from into its their they them his her our you your are not but did does when where which than then there here explained explainer part history historys real true story about over under after before became become becomes made make civil war'.split(' '),
);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)); // crude plural fold

const plannerText = (v: Video) => [v.title, v.subtitle].filter(Boolean).join(' ');

export interface Candidate {
  video: Video;
  score: number; // 0–1
}

/** Planner videos that might be this upload, best first. Rare shared words count for more than common ones. */
export function candidatesFor(yt: YTVideo, planner: Planner): Candidate[] {
  const pool = planner.videos.filter((v) => v.kind === (yt.isShort ? 'short' : 'long'));
  const df = new Map<string, number>();
  for (const v of planner.videos) for (const w of new Set(words(plannerText(v)))) df.set(w, (df.get(w) ?? 0) + 1);
  const weight = (w: string) => 1 / Math.log(2 + (df.get(w) ?? 0));
  const ytWords = new Set(words(yt.title));
  const ytWeight = [...ytWords].reduce((a, w) => a + weight(w), 0);
  const scoreText = (text: string) => {
    const pw = new Set(words(text));
    const shared = [...pw].filter((w) => ytWords.has(w));
    if (shared.length < 2) return 0;
    const sharedWeight = shared.reduce((a, w) => a + weight(w), 0);
    const pWeight = [...pw].reduce((a, w) => a + weight(w), 0);
    return Math.min(1, sharedWeight / Math.max(1e-9, Math.min(pWeight, ytWeight)));
  };
  return pool
    .map((video) => {
      // The planner's title, its subtitle, or both together: whichever lines up best with the YouTube title.
      const texts = [video.title, video.subtitle, plannerText(video)].filter(Boolean) as string[];
      return { video, score: Math.max(...texts.map(scoreText)) };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** A planner video this upload almost certainly is: a strong match, clearly ahead of the next one. */
export function confidentMatch(yt: YTVideo, planner: Planner, taken: Set<string>): Video | undefined {
  const c = candidatesFor(yt, planner).filter((x) => !taken.has(x.video.id));
  if (!c[0] || c[0].score < 0.45) return undefined;
  if (c[1] && c[0].score - c[1].score < 0.15) return undefined;
  return c[0].video;
}

/**
 * Bring the planner up to date with YouTube: auto-link confident matches, and mark linked videos (and their
 * calendar releases) as published on the day they went live. Returns null when nothing needs to change.
 */
export function reconcile(planner: Planner, data: YouTubeData): ((p: Planner) => void) | null {
  const linked = new Map(planner.videos.filter((v) => v.youtubeId).map((v) => [v.youtubeId!, v.id]));
  const skip = new Set(planner.ytSkip ?? []);
  const taken = new Set(linked.values());
  const links: [string, string][] = []; // [plannerVideoId, ytId]
  for (const yt of [...data.videos].reverse()) {
    if (linked.has(yt.id) || skip.has(yt.id)) continue;
    const match = confidentMatch(yt, planner, taken);
    if (match) {
      links.push([match.id, yt.id]);
      taken.add(match.id);
    }
  }
  const byYt = new Map(data.videos.map((v) => [v.id, v]));
  const allLinks = new Map([...linked.entries()].map(([yt, vid]) => [vid, yt]));
  for (const [vid, yt] of links) allLinks.set(vid, yt);
  const needs =
    links.length > 0 ||
    planner.videos.some((v) => {
      const yt = byYt.get(allLinks.get(v.id) ?? '');
      return yt && (v.status !== 'published' || v.publishedAt !== ytDay(yt));
    }) ||
    planner.releases.some((r) => r.videoId && byYt.has(allLinks.get(r.videoId) ?? '') && r.status !== 'published');
  if (!needs) return null;

  return (p: Planner) => {
    for (const [vid, yt] of links) {
      const v = p.videos.find((x) => x.id === vid);
      if (v && !v.youtubeId) v.youtubeId = yt;
    }
    for (const v of p.videos) {
      const yt = v.youtubeId && byYt.get(v.youtubeId);
      if (!yt) continue;
      v.status = 'published';
      v.publishedAt = ytDay(yt);
      for (const r of p.releases) if (r.videoId === v.id) r.status = 'published';
    }
  };
}
