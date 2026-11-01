// YouTube public stats (YouTube Data API v3, API key only). A sync reads the channel's uploads with their
// views/likes/comments, stores them in D1, and keeps snapshots so we know how a new video did in its first days.
// Runs every hour from the Worker's cron trigger, and on demand from the Stats tab.
import type { YouTubeData, YTChannel, YTVideo } from '../src/types';

export interface YouTubeEnv {
  DB: D1Database;
  YOUTUBE_API_KEY?: string; // Worker secret
  YOUTUBE_HANDLE?: string; // e.g. "@thechunkhistory"
}

const API = 'https://www.googleapis.com/youtube/v3';
const HOUR = 3600_000;
const MIN_SYNC_GAP = 2 * 60_000; // "Sync now" at most every 2 minutes
const SHORT_MAX_SECONDS = 180; // YouTube Shorts can be up to 3 minutes

const INIT = [
  `CREATE TABLE IF NOT EXISTS yt_videos (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS yt_snapshots (video_id TEXT NOT NULL, at TEXT NOT NULL, views INTEGER NOT NULL, PRIMARY KEY (video_id, at))`,
  `CREATE TABLE IF NOT EXISTS yt_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];
const ensure = (db: D1Database) => db.batch(INIT.map((q) => db.prepare(q)));

class YTError extends Error {}

async function call<T>(key: string, path: string, params: Record<string, string>): Promise<T> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key })}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new YTError('Couldn’t reach YouTube.');
  }
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.details?.[0]?.reason ?? '';
    if (/keyInvalid|API_KEY_INVALID/i.test(reason) || /API key not valid/i.test(body?.error?.message ?? '')) throw new YTError('The YouTube API key was rejected. Check the YOUTUBE_API_KEY secret.');
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason)) throw new YTError('“YouTube Data API v3” isn’t turned on for that key’s Google Cloud project.');
    if (/quotaExceeded|dailyLimitExceeded/i.test(reason)) throw new YTError('YouTube’s daily quota for this key is used up; it resets at midnight Pacific time.');
    throw new YTError(`YouTube had a problem (${res.status}${body?.error?.message ? `: ${body.error.message}` : ''}).`);
  }
  return body as T;
}

/** "PT1H2M3S" → seconds */
export function parseDuration(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

const bestThumb = (t: any): string => (t?.maxres ?? t?.standard ?? t?.high ?? t?.medium ?? t?.default)?.url ?? '';
const num = (v: unknown) => (v == null ? undefined : Number(v));

async function meta(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM yt_meta WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
const setMeta = (db: D1Database, key: string, value: string) =>
  db.prepare('INSERT OR REPLACE INTO yt_meta (key, value) VALUES (?, ?)').bind(key, value);

export async function syncYouTube(env: YouTubeEnv, force = false): Promise<void> {
  if (!env.YOUTUBE_API_KEY) return;
  const db = env.DB;
  await ensure(db);
  const last = await meta(db, 'last_sync');
  if (!force && last && Date.now() - Date.parse(last) < MIN_SYNC_GAP) return;
  const key = env.YOUTUBE_API_KEY;
  const handle = (env.YOUTUBE_HANDLE || '').trim();

  try {
    // 1. The channel and its uploads playlist.
    const ch = await call<any>(key, 'channels', { part: 'snippet,contentDetails,statistics', forHandle: handle });
    const c = ch.items?.[0];
    if (!c) throw new YTError(`YouTube has no channel with the handle ${handle}.`);
    const channel: YTChannel = {
      id: c.id,
      title: c.snippet?.title ?? handle,
      handle,
      thumb: bestThumb(c.snippet?.thumbnails),
      subscribers: c.statistics?.hiddenSubscriberCount ? undefined : num(c.statistics?.subscriberCount),
      views: num(c.statistics?.viewCount),
      videoCount: num(c.statistics?.videoCount),
    };
    const uploads: string = c.contentDetails?.relatedPlaylists?.uploads;

    // 2. Every upload's id (50 per page).
    const ids: string[] = [];
    let pageToken = '';
    for (let page = 0; page < 20; page++) {
      const pl = await call<any>(key, 'playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '50', ...(pageToken && { pageToken }) });
      for (const it of pl.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      pageToken = pl.nextPageToken ?? '';
      if (!pageToken) break;
    }

    // 3. Details and stats, 50 videos per call.
    const videos: YTVideo[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const vs = await call<any>(key, 'videos', { part: 'snippet,contentDetails,statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
      for (const v of vs.items ?? []) {
        if (v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none') continue; // upcoming premieres/streams
        const duration = parseDuration(v.contentDetails?.duration ?? '');
        videos.push({
          id: v.id,
          title: v.snippet?.title ?? '',
          publishedAt: v.snippet?.publishedAt ?? '',
          thumb: bestThumb(v.snippet?.thumbnails),
          duration,
          isShort: duration > 0 && duration <= SHORT_MAX_SECONDS,
          views: num(v.statistics?.viewCount) ?? 0,
          likes: num(v.statistics?.likeCount),
          comments: num(v.statistics?.commentCount),
        });
      }
    }

    // 4. Store: replace the video list, add a views snapshot (hourly while a video is under 8 days old, then daily).
    const now = new Date();
    const nowIso = now.toISOString();
    const hourKey = nowIso.slice(0, 13); // YYYY-MM-DDTHH
    const dayKey = nowIso.slice(0, 10);
    const stmts: D1PreparedStatement[] = [];
    const keep = new Set(videos.map((v) => v.id));
    const existing = await db.prepare('SELECT id FROM yt_videos').all<{ id: string }>();
    for (const r of existing.results) if (!keep.has(r.id)) stmts.push(db.prepare('DELETE FROM yt_videos WHERE id = ?').bind(r.id));
    for (const v of videos) {
      stmts.push(db.prepare('INSERT OR REPLACE INTO yt_videos (id, data, updated_at) VALUES (?, ?, ?)').bind(v.id, JSON.stringify(v), nowIso));
      const young = now.getTime() - Date.parse(v.publishedAt) < 8 * 24 * HOUR;
      stmts.push(
        db.prepare('INSERT OR REPLACE INTO yt_snapshots (video_id, at, views) VALUES (?, ?, ?)').bind(v.id, young ? hourKey : dayKey, v.views),
      );
    }
    stmts.push(setMeta(db, 'channel', JSON.stringify(channel)), setMeta(db, 'last_sync', nowIso), setMeta(db, 'error', ''));
    await db.batch(stmts);
  } catch (e) {
    const message = e instanceof YTError ? e.message : `Sync failed: ${e instanceof Error ? e.message : e}`;
    await db.batch([setMeta(db, 'error', message), setMeta(db, 'last_sync', new Date().toISOString())]);
  }
}

/** Snapshot key → time: "YYYY-MM-DDTHH" is that hour, "YYYY-MM-DD" is midnight UTC. */
const snapTime = (at: string) => Date.parse(at.length === 13 ? `${at}:00:00Z` : `${at}T00:00:00Z`);

/** Views at an exact time, interpolated between the snapshots either side; null if we didn't watch it then. */
export function viewsAt(snaps: { t: number; views: number }[], target: number): number | null {
  let before: { t: number; views: number } | undefined;
  let after: { t: number; views: number } | undefined;
  for (const s of snaps) {
    if (s.t <= target) before = s;
    else {
      after = s;
      break;
    }
  }
  if (!before || !after) return before && before.t === target ? before.views : null;
  if (after.t - before.t > 36 * HOUR) return null; // too big a gap to trust
  return Math.round(before.views + ((after.views - before.views) * (target - before.t)) / (after.t - before.t));
}

export async function getYouTube(env: YouTubeEnv): Promise<YouTubeData> {
  const configured = !!env.YOUTUBE_API_KEY;
  const db = env.DB;
  await ensure(db);
  if (configured && !(await meta(db, 'last_sync'))) await syncYouTube(env, true);

  const [rows, snaps, channel, lastSync, error] = await Promise.all([
    db.prepare('SELECT data FROM yt_videos').all<{ data: string }>(),
    db.prepare('SELECT video_id, at, views FROM yt_snapshots ORDER BY video_id, at').all<{ video_id: string; at: string; views: number }>(),
    meta(db, 'channel'),
    meta(db, 'last_sync'),
    meta(db, 'error'),
  ]);

  const byVideo = new Map<string, { t: number; views: number }[]>();
  for (const s of snaps.results) {
    const list = byVideo.get(s.video_id) ?? [];
    list.push({ t: snapTime(s.at), views: s.views });
    byVideo.set(s.video_id, list);
  }
  const videos = rows.results
    .map((r) => JSON.parse(r.data) as YTVideo)
    .map((v) => {
      const list = (byVideo.get(v.id) ?? []).sort((a, b) => a.t - b.t);
      const pub = Date.parse(v.publishedAt);
      return { ...v, v24: viewsAt(list, pub + 24 * HOUR), v48: viewsAt(list, pub + 48 * HOUR), v7d: viewsAt(list, pub + 168 * HOUR) };
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return {
    configured,
    channel: channel ? JSON.parse(channel) : undefined,
    videos,
    lastSync: lastSync ?? undefined,
    error: error || undefined,
  };
}

/** A short summary of what's working, for the AI brainstorm. */
export async function performanceSummary(env: YouTubeEnv): Promise<string> {
  if (!env.YOUTUBE_API_KEY) return '';
  try {
    await ensure(env.DB);
    const rows = await env.DB.prepare('SELECT data FROM yt_videos').all<{ data: string }>();
    const now = Date.now();
    const vids = rows.results
      .map((r) => JSON.parse(r.data) as YTVideo)
      .filter((v) => !v.isShort && now - Date.parse(v.publishedAt) > 3 * 24 * HOUR)
      .map((v) => ({ ...v, perDay: v.views / Math.max(1, (now - Date.parse(v.publishedAt)) / (24 * HOUR)) }))
      .sort((a, b) => b.perDay - a.perDay);
    if (vids.length < 4) return '';
    const fmt = (v: (typeof vids)[number]) => `- ${v.title} (${v.views} views, ${v.perDay.toFixed(1)}/day)`;
    const nBest = Math.min(4, Math.ceil(vids.length / 2));
    const nWorst = Math.min(3, vids.length - nBest); // never overlaps the best list
    return `How the channel's long videos are doing on YouTube (views per day since posting):
Best:
${vids.slice(0, nBest).map(fmt).join('\n')}
Weakest:
${vids.slice(vids.length - nWorst).map(fmt).join('\n')}
Lean toward what the best ones have in common.`;
  } catch {
    return '';
  }
}
