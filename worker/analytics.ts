// YouTube Analytics (level 2): a one-time Google sign-in with the channel's account, then a daily sync of each
// video's watch time, retention, subscribers gained, and views from North America. The sign-in's refresh token
// stays in D1 and never reaches the browser.
import type { AnalyticsData, VideoAnalytics } from '../src/types';

export interface AnalyticsEnv {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string; // Worker secret
  GOOGLE_CLIENT_SECRET?: string; // Worker secret
}

const SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const REPORTS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const DAY = 864e5;
const STATE_TTL = 15 * 60_000;
const DAILY = 20 * 3600_000; // the cron refreshes analytics about once a day
const MANUAL_GAP = 5 * 60_000;

interface Tokens {
  refresh_token: string;
  access_token?: string;
  expires_at?: number;
  connected_at: string;
}

const INIT = `CREATE TABLE IF NOT EXISTS yt_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
async function getMeta(db: D1Database, key: string): Promise<string | null> {
  await db.prepare(INIT).run();
  const row = await db.prepare('SELECT value FROM yt_meta WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
async function setMeta(db: D1Database, key: string, value: string | null) {
  await db.prepare(INIT).run();
  if (value === null) await db.prepare('DELETE FROM yt_meta WHERE key = ?').bind(key).run();
  else await db.prepare('INSERT OR REPLACE INTO yt_meta (key, value) VALUES (?, ?)').bind(key, value).run();
}

export const analyticsConfigured = (env: AnalyticsEnv) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const redirectUri = (origin: string) => `${origin}/api/youtube/oauth/callback`;

/** Step 1: send the browser to Google's sign-in, with a one-time state value to check on the way back. */
export async function startSignIn(env: AnalyticsEnv, origin: string): Promise<Response> {
  if (!analyticsConfigured(env)) return Response.redirect(`${origin}/#stats`, 302);
  const state = crypto.randomUUID();
  await setMeta(env.DB, 'oauth_state', JSON.stringify({ state, at: Date.now() }));
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // gives a refresh token, so you don't have to sign in again
    prompt: 'consent', // ...every time, even on a reconnect
    include_granted_scopes: 'true',
    state,
  }).toString();
  return Response.redirect(url.toString(), 302);
}

/** Step 2: Google sends the browser back here with a code; swap it for tokens and store them. */
export async function finishSignIn(env: AnalyticsEnv, url: URL): Promise<Response> {
  const back = (problem?: string) =>
    (problem ? setMeta(env.DB, 'analytics_error', problem) : Promise.resolve()).then(() => Response.redirect(`${url.origin}/#stats`, 302));
  if (!analyticsConfigured(env)) return back();

  const saved = JSON.parse((await getMeta(env.DB, 'oauth_state')) ?? 'null') as { state: string; at: number } | null;
  await setMeta(env.DB, 'oauth_state', null); // one use only
  const err = url.searchParams.get('error');
  if (err) return back(err === 'access_denied' ? 'Sign-in was cancelled, so Analytics isn’t connected.' : `Google sign-in failed (${err}).`);
  if (!saved || saved.state !== url.searchParams.get('state') || Date.now() - saved.at > STATE_TTL) {
    return back('That sign-in link expired or didn’t match. Press “Connect YouTube Analytics” again.');
  }
  const code = url.searchParams.get('code');
  if (!code) return back('Google didn’t send a sign-in code. Try again.');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(url.origin),
      grant_type: 'authorization_code',
    }),
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !body.refresh_token) {
    const why =
      body.error === 'redirect_uri_mismatch'
        ? 'Google says the redirect URI doesn’t match. Check the Authorized redirect URI in the OAuth client.'
        : body.error === 'invalid_client'
          ? 'Google rejected the client ID or secret. Check the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets.'
          : !body.refresh_token && res.ok
            ? 'Google didn’t give a long-term sign-in. Remove “Chunk Planner” at myaccount.google.com → Security → Third-party access, then connect again.'
            : `Google sign-in failed (${body.error_description ?? body.error ?? res.status}).`;
    return back(why);
  }
  const tokens: Tokens = {
    refresh_token: body.refresh_token,
    access_token: body.access_token,
    expires_at: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    connected_at: new Date().toISOString(),
  };
  await setMeta(env.DB, 'oauth', JSON.stringify(tokens));
  await setMeta(env.DB, 'analytics_error', null);
  await syncAnalytics(env, 'force');
  return back();
}

class AnalyticsError extends Error {}

async function accessToken(env: AnalyticsEnv): Promise<string> {
  const tokens = JSON.parse((await getMeta(env.DB, 'oauth')) ?? 'null') as Tokens | null;
  if (!tokens) throw new AnalyticsError('Not connected.');
  if (tokens.access_token && (tokens.expires_at ?? 0) > Date.now() + 60_000) return tokens.access_token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !body.access_token) {
    if (body.error === 'invalid_grant') {
      await setMeta(env.DB, 'oauth', null);
      throw new AnalyticsError('The YouTube Analytics sign-in expired or was removed. Connect again.');
    }
    throw new AnalyticsError(`Couldn’t refresh the YouTube sign-in (${body.error ?? res.status}).`);
  }
  tokens.access_token = body.access_token;
  tokens.expires_at = Date.now() + (Number(body.expires_in) || 3600) * 1000;
  await setMeta(env.DB, 'oauth', JSON.stringify(tokens));
  return body.access_token;
}

async function report(token: string, params: Record<string, string>): Promise<Record<string, string | number>[]> {
  const url = new URL(REPORTS_URL);
  url.search = new URLSearchParams({ ids: 'channel==MINE', ...params }).toString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? '';
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used|is disabled/i.test(body?.error?.message ?? '')) {
      throw new AnalyticsError('“YouTube Analytics API” isn’t turned on in the Google Cloud project.');
    }
    if (res.status === 401 || res.status === 403) throw new AnalyticsError('YouTube refused the Analytics request. Make sure you signed in with the account that owns the channel.');
    throw new AnalyticsError(`YouTube Analytics had a problem (${res.status}${body?.error?.message ? `: ${body.error.message}` : ''}).`);
  }
  const cols: string[] = (body.columnHeaders ?? []).map((c: any) => c.name);
  return (body.rows ?? []).map((r: any[]) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

const pacificDate = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

/** Pulls lifetime per-video numbers: everything, US + Canada (Northern America), and Mexico. */
/** mode: "cron" refreshes about once a day; "manual" (Sync now) at most every 5 minutes; "force" always. */
export async function syncAnalytics(env: AnalyticsEnv, mode: 'cron' | 'manual' | 'force' = 'cron'): Promise<void> {
  if (!analyticsConfigured(env) || !(await getMeta(env.DB, 'oauth'))) return;
  const prev = JSON.parse((await getMeta(env.DB, 'analytics')) ?? 'null') as { syncedAt?: string } | null;
  const lastTry = Number((await getMeta(env.DB, 'analytics_try')) ?? 0);
  if (mode === 'cron' && prev?.syncedAt && Date.now() - Date.parse(prev.syncedAt) < DAILY) return;
  if (mode !== 'force' && Date.now() - lastTry < MANUAL_GAP) return;
  await setMeta(env.DB, 'analytics_try', String(Date.now()));
  try {
    const token = await accessToken(env);
    const range = { startDate: '2015-01-01', endDate: pacificDate(Date.now()) };
    const top = { dimensions: 'video', sort: '-views', maxResults: '200', ...range };
    const [all, na, mx] = await Promise.all([
      report(token, { ...top, metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained' }),
      report(token, { ...top, metrics: 'views', filters: 'subContinent==021' }), // UN M49 "Northern America": US, Canada (+ Bermuda, Greenland)
      report(token, { ...top, metrics: 'views', filters: 'country==MX' }),
    ]);
    const videos: Record<string, VideoAnalytics> = {};
    for (const r of all) {
      videos[String(r.video)] = {
        views: Number(r.views) || 0,
        minutes: Number(r.estimatedMinutesWatched) || 0,
        avgDuration: Number(r.averageViewDuration) || 0,
        avgPercent: Number(r.averageViewPercentage) || 0,
        subs: Number(r.subscribersGained) || 0,
        naViews: 0,
        mxViews: 0,
      };
    }
    for (const r of na) if (videos[String(r.video)]) videos[String(r.video)].naViews = Number(r.views) || 0;
    for (const r of mx) if (videos[String(r.video)]) videos[String(r.video)].mxViews = Number(r.views) || 0;
    await setMeta(
      env.DB,
      'analytics',
      JSON.stringify({ syncedAt: new Date().toISOString(), through: pacificDate(Date.now() - 2 * DAY), videos }),
    );
    await setMeta(env.DB, 'analytics_error', null);
  } catch (e) {
    await setMeta(env.DB, 'analytics_error', e instanceof AnalyticsError ? e.message : `Analytics sync failed: ${e instanceof Error ? e.message : e}`);
  }
}

export async function getAnalytics(env: AnalyticsEnv): Promise<AnalyticsData> {
  const configured = analyticsConfigured(env);
  const [tokens, saved, error] = await Promise.all([getMeta(env.DB, 'oauth'), getMeta(env.DB, 'analytics'), getMeta(env.DB, 'analytics_error')]);
  const data = JSON.parse(saved ?? 'null') as { syncedAt?: string; through?: string; videos?: Record<string, VideoAnalytics> } | null;
  return {
    configured,
    connected: configured && !!tokens,
    syncedAt: data?.syncedAt,
    through: data?.through,
    error: error || undefined,
    videos: data?.videos ?? {},
  };
}

/** Forget the sign-in (and tell Google to revoke it). The last numbers stay until the next connect. */
export async function disconnect(env: AnalyticsEnv): Promise<void> {
  const tokens = JSON.parse((await getMeta(env.DB, 'oauth')) ?? 'null') as Tokens | null;
  if (tokens?.refresh_token) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(tokens.refresh_token)}`, { method: 'POST' }).catch(() => {});
  }
  await setMeta(env.DB, 'oauth', null);
  await setMeta(env.DB, 'analytics_error', null);
}
