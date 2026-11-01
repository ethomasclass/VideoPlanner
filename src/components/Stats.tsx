import { useMemo, useState } from 'react';
import type { Planner, Video, YouTubeData, YTVideo } from '../types.ts';
import { fmtShort, fromISO } from '../lib/dates.ts';
import { newId } from '../lib/schedule.ts';
import { candidatesFor, compact, perDay, ytDay, ytUrl } from '../lib/youtube.ts';

interface Props {
  planner: Planner;
  update: (change: (draft: Planner) => void) => void;
  yt: YouTubeData | null;
  ytError: string;
  syncing: boolean;
  onSync: () => void;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ago = (iso?: string) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const fmtDuration = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}`) + `:${String(s % 60).padStart(2, '0')}`;

type Sort = 'newest' | 'views' | 'perday';
type Kind = 'all' | 'long' | 'short';

export default function Stats({ planner, update, yt, ytError, syncing, onSync }: Props) {
  const [sort, setSort] = useState<Sort>('newest');
  const [kind, setKind] = useState<Kind>('all');

  const linkedBy = useMemo(() => new Map(planner.videos.filter((v) => v.youtubeId).map((v) => [v.youtubeId!, v])), [planner]);
  const skip = new Set(planner.ytSkip ?? []);

  if (!yt) {
    return (
      <section className="stats">
        <h1 className="tape">Stats</h1>
        <p className="hand">{ytError ? `couldn't load youtube stats: ${ytError}` : 'loading youtube stats…'}</p>
      </section>
    );
  }

  if (!yt.configured && yt.videos.length === 0) {
    return (
      <section className="stats">
        <h1 className="tape">Stats</h1>
        <div className="panel setup-panel">
          <h2 className="tape small">Connect YouTube (free, once)</h2>
          <p>The Stats tab reads your channel’s public numbers: every upload with its date, real thumbnail, views, likes and comments, refreshed every hour.</p>
          <ol>
            <li>Open <b>console.cloud.google.com</b> and pick (or create) a project, e.g. <i>chunk-planner</i>.</li>
            <li><b>APIs &amp; Services → Library</b>, search <b>YouTube Data API v3</b>, and click <b>Enable</b>.</li>
            <li><b>APIs &amp; Services → Credentials → Create credentials → API key</b>. Optional: <i>Edit API key → API restrictions → YouTube Data API v3</i>.</li>
            <li>In Cloudflare: the <b>chunk-planner</b> Worker → <b>Settings → Variables and Secrets → Add</b>, type <b>Secret</b>, name <code>YOUTUBE_API_KEY</code>, paste the key, save.</li>
          </ol>
          <p className="hand">then come back here. keep the key out of chat and out of the repo.</p>
        </div>
      </section>
    );
  }

  const videos = yt.videos;
  const longs = videos.filter((v) => !v.isShort);
  const shorts = videos.filter((v) => v.isShort);
  const unmatched = videos.filter((v) => !linkedBy.has(v.id) && !skip.has(v.id));

  // Best posting day for long videos: median views per day by weekday (needs 2+ videos on a day).
  const byDay = new Map<number, number[]>();
  for (const v of longs) {
    const d = fromISO(ytDay(v)).getDay();
    byDay.set(d, [...(byDay.get(d) ?? []), perDay(v)]);
  }
  const bestDay = [...byDay.entries()].filter(([, xs]) => xs.length >= 2).sort((a, b) => median(b[1]) - median(a[1]))[0];
  const newestTracked = videos.find((v) => v.v48 != null);

  const shown = videos
    .filter((v) => kind === 'all' || (kind === 'short') === v.isShort)
    .sort((a, b) => (sort === 'views' ? b.views - a.views : sort === 'perday' ? perDay(b) - perDay(a) : b.publishedAt.localeCompare(a.publishedAt)));

  const link = (ytId: string, videoId: string) =>
    update((p) => {
      for (const v of p.videos) if (v.youtubeId === ytId) delete v.youtubeId;
      const v = p.videos.find((x) => x.id === videoId);
      if (v) v.youtubeId = ytId;
      p.ytSkip = (p.ytSkip ?? []).filter((x) => x !== ytId);
    });
  const unlink = (ytId: string) =>
    update((p) => {
      for (const v of p.videos) if (v.youtubeId === ytId) delete v.youtubeId;
      p.ytSkip = [...new Set([...(p.ytSkip ?? []), ytId])]; // don't auto-link it again
    });
  const ignore = (ytId: string) => update((p) => void (p.ytSkip = [...new Set([...(p.ytSkip ?? []), ytId])]));
  const addAsNew = (v: YTVideo) =>
    update((p) => {
      const nv: Video = { id: newId(v.isShort ? 'short' : 'video'), kind: v.isShort ? 'short' : 'long', title: v.title, status: 'published', youtubeId: v.id, publishedAt: ytDay(v) };
      p.videos.push(nv);
      p.ytSkip = (p.ytSkip ?? []).filter((x) => x !== v.id);
    });

  return (
    <section className="stats">
      <div className="stats-head">
        {yt.channel?.thumb && <img className="channel-avatar" src={yt.channel.thumb} alt="" />}
        <div className="stats-title">
          <h1 className="tape">Stats</h1>
          {yt.channel && (
            <a className="mono" href={`https://www.youtube.com/${yt.channel.handle}`} target="_blank" rel="noreferrer">
              {yt.channel.title.toUpperCase()} · {yt.channel.handle.toUpperCase()}
            </a>
          )}
        </div>
        <div className="sync">
          <span className="mono">SYNCED {ago(yt.lastSync).toUpperCase()}</span>
          <button className="link" onClick={onSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>
        </div>
      </div>
      {(yt.error || ytError) && <p className="error-note">{yt.error || ytError}</p>}

      <div className="stat-tiles">
        <Tile big={compact(yt.channel?.subscribers)} label="SUBSCRIBERS" />
        <Tile big={compact(yt.channel?.views)} label="TOTAL VIEWS" />
        <Tile big={compact(median(longs.map((v) => v.views)))} label="MEDIAN VIEWS · LONG" note={`${longs.length} videos`} />
        <Tile big={compact(median(shorts.map((v) => v.views)))} label="MEDIAN VIEWS · SHORTS" note={`${shorts.length} Shorts`} />
        <Tile
          big={bestDay ? DAYS[bestDay[0]].slice(0, 3) : '–'}
          label="BEST DAY · LONG"
          note={bestDay ? `${median(bestDay[1]).toFixed(1)} views/day (median)` : 'needs 2+ videos on a day'}
        />
        {newestTracked && (
          <Tile big={compact(newestTracked.v48)} label="FIRST 48 H" note={newestTracked.title} />
        )}
      </div>

      {unmatched.length > 0 && (
        <div className="panel">
          <h2 className="tape small">Link to your planner</h2>
          <p className="hand small-hand">these uploads aren't linked to a video in your planner yet.</p>
          <ul className="link-list">
            {unmatched.map((v) => {
              const cands = candidatesFor(v, planner).filter((c) => !c.video.youtubeId).slice(0, 3);
              const rest = planner.videos
                .filter((p) => p.kind === (v.isShort ? 'short' : 'long') && !p.youtubeId && !cands.some((c) => c.video.id === p.id))
                .sort((a, b) => a.title.localeCompare(b.title));
              return (
                <li key={v.id}>
                  <img src={v.thumb} alt="" loading="lazy" />
                  <div className="link-text">
                    <b>{v.title}</b>
                    <span className="mono">{v.isShort ? 'SHORT · ' : ''}{fmtShort(ytDay(v)).toUpperCase()}</span>
                  </div>
                  <select value="" onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'new') addAsNew(v);
                    else if (val === 'ignore') ignore(v.id);
                    else if (val) link(v.id, val);
                  }} aria-label={`Link ${v.title}`}>
                    <option value="">Link to…</option>
                    {cands.length > 0 && (
                      <optgroup label="Likely">
                        {cands.map((c) => <option key={c.video.id} value={c.video.id}>{c.video.title}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Other videos">
                      {rest.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </optgroup>
                    <optgroup label="Or">
                      <option value="new">Add to planner as a new video</option>
                      <option value="ignore">Ignore it</option>
                    </optgroup>
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="list-head">
        <h2 className="tape small">Uploads</h2>
        <div className="filters">
          {(['all', 'long', 'short'] as const).map((k) => (
            <button key={k} className={`filter${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'long' ? 'Long videos' : 'Shorts'}
            </button>
          ))}
        </div>
        <label className="sort">
          <span className="mono">SORT</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">Newest</option>
            <option value="views">Most views</option>
            <option value="perday">Views per day</option>
          </select>
        </label>
      </div>

      <div className="upload-list">
        {shown.map((v) => {
          const pv = linkedBy.get(v.id);
          return (
            <article key={v.id} className="upload">
              <a href={ytUrl(v)} target="_blank" rel="noreferrer" className={`upload-thumb${v.isShort ? ' short' : ''}`}>
                <img src={v.thumb} alt="" loading="lazy" />
                <span className="duration">{fmtDuration(v.duration)}</span>
              </a>
              <div className="upload-text">
                <a href={ytUrl(v)} target="_blank" rel="noreferrer" className="upload-title">{v.title}</a>
                <span className="mono">
                  {v.isShort ? 'SHORT · ' : ''}{fmtShort(ytDay(v)).toUpperCase()}
                </span>
                {pv ? (
                  <span className="linked">
                    planner: {pv.title} <button className="link small-link" onClick={() => unlink(v.id)}>unlink</button>
                  </span>
                ) : skip.has(v.id) ? (
                  <span className="linked muted">not linked <button className="link small-link" onClick={() => update((p) => void (p.ytSkip = (p.ytSkip ?? []).filter((x) => x !== v.id)))}>link…</button></span>
                ) : null}
              </div>
              <dl className="upload-nums">
                <div><dt>Views</dt><dd>{compact(v.views)}</dd></div>
                <div><dt>Per day</dt><dd>{perDay(v).toFixed(perDay(v) < 10 ? 1 : 0)}</dd></div>
                <div><dt>48 h</dt><dd>{compact(v.v48)}</dd></div>
                <div><dt>Likes</dt><dd>{compact(v.likes)}</dd></div>
                <div><dt>Comments</dt><dd>{compact(v.comments)}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
      <p className="muted-note">
        Public numbers from YouTube, refreshed hourly. “48 h” is filled in for uploads the planner sees while they’re new.
        Watch time, retention and click-through rate need YouTube Analytics (level 2).
      </p>
    </section>
  );
}

function Tile({ big, label, note }: { big: string; label: string; note?: string }) {
  return (
    <div className="tile">
      <span className="tile-num">{big}</span>
      <span className="mono">{label}</span>
      {note && <small>{note}</small>}
    </div>
  );
}
