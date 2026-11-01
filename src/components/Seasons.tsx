import { useState } from 'react';
import type { Planner, ReleaseWindow } from '../types.ts';
import { MONTHS, fmtShort, fromISO, todayISO } from '../lib/dates.ts';
import { newId, nextOccurrence } from '../lib/schedule.ts';

interface Props {
  planner: Planner;
  update: (change: (draft: Planner) => void) => void;
}

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n: number) => String(n).padStart(2, '0');
const md = (m: number, d: number) => `${pad(m)}-${pad(Math.min(d, DAYS_IN[m - 1]))}`;
const parts = (s: string) => s.split('-').map(Number) as [number, number];
const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 864e5);

/** Month + day pickers for a yearly date ("MM-DD"). */
function MonthDay({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [m, d] = parts(value);
  return (
    <span className="monthday" aria-label={label}>
      <select value={m} onChange={(e) => onChange(md(Number(e.target.value), d))} aria-label={`${label} month`}>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>{name.slice(0, 3)}</option>
        ))}
      </select>
      <select value={d} onChange={(e) => onChange(md(m, Number(e.target.value)))} aria-label={`${label} day`}>
        {Array.from({ length: DAYS_IN[m - 1] }, (_, i) => (
          <option key={i} value={i + 1}>{i + 1}</option>
        ))}
      </select>
    </span>
  );
}

export default function Seasons({ planner, update }: Props) {
  const today = todayISO();
  const [draft, setDraft] = useState({ name: '', start: '12-01', end: '12-25' });

  const edit = (id: string, change: (w: ReleaseWindow) => void) =>
    update((p) => {
      const w = p.windows.find((x) => x.id === id);
      if (w) change(w);
    });

  const add = () => {
    const name = draft.name.trim();
    if (!name) return;
    update((p) => {
      p.windows.push({ id: newId('season'), name, start: draft.start, end: draft.end });
    });
    setDraft({ ...draft, name: '' });
  };

  const remove = (w: ReleaseWindow) => {
    if (!confirm(`Delete “${w.name}”? Videos tagged with it lose the tag.`)) return;
    update((p) => {
      p.windows = p.windows.filter((x) => x.id !== w.id);
      for (const v of p.videos) if (v.seasons) v.seasons = v.seasons.filter((s) => s !== w.id);
    });
  };

  const tag = (seasonId: string, videoId: string, on: boolean) =>
    update((p) => {
      const v = p.videos.find((x) => x.id === videoId);
      if (!v) return;
      const set = new Set(v.seasons ?? []);
      if (on) set.add(seasonId);
      else set.delete(seasonId);
      v.seasons = set.size ? [...set] : undefined;
    });

  const ordered = planner.windows
    .map((w) => ({ w, o: nextOccurrence(w, today) }))
    .sort((a, b) => a.o.start.localeCompare(b.o.start));
  const published = planner.videos
    .filter((v) => v.status === 'published')
    .sort((a, b) => a.kind.localeCompare(b.kind) || (b.number ?? 0) - (a.number ?? 0) || a.title.localeCompare(b.title));

  return (
    <section className="seasons">
      <div className="seasons-intro">
        <h1 className="tape">Seasons</h1>
        <p className="hand">
          times of year when some topics get extra attention. dates repeat every year. during a season, the videos you tag
          here come first in the monday suggestions, and the ai brainstorm aims its ideas at seasons coming up.
        </p>
      </div>

      <div className="panel season-add">
        <h2 className="tape small">Add a season</h2>
        <div className="season-add-row">
          <label className="field">
            <span>Name</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="e.g. Christmas, Women's History Month"
            />
          </label>
          <label className="field shrink">
            <span>From</span>
            <MonthDay label="From" value={draft.start} onChange={(start) => setDraft({ ...draft, start })} />
          </label>
          <label className="field shrink">
            <span>To</span>
            <MonthDay label="To" value={draft.end} onChange={(end) => setDraft({ ...draft, end })} />
          </label>
          <button className="primary align-end" onClick={add} disabled={!draft.name.trim()}>Add</button>
        </div>
        {draft.end < draft.start && <small className="hint">runs over new year: {fmtYearly(draft.start)} to {fmtYearly(draft.end)}</small>}
      </div>

      <div className="season-list">
        {ordered.map(({ w, o }) => {
          const tagged = published.filter((v) => v.seasons?.includes(w.id));
          const untagged = published.filter((v) => !v.seasons?.includes(w.id));
          const when = o.now ? `on now, until ${fmtShort(o.end)}` : `starts in ${daysBetween(today, o.start)} days (${fmtShort(o.start)})`;
          return (
            <article key={w.id} className={`season-card${o.now ? ' now' : ''}${w.hidden ? ' hidden-season' : ''}`}>
              <div className="season-head">
                <NameInput key={w.name} value={w.name} onCommit={(name) => edit(w.id, (x) => (x.name = name))} />
                <span className={`mono${o.now ? ' now-label' : ''}`}>{when.toUpperCase()}</span>
              </div>
              <div className="season-dates">
                <span className="field-inline">From</span>
                <MonthDay label="From" value={w.start} onChange={(v) => edit(w.id, (x) => (x.start = v))} />
                <span className="field-inline">to</span>
                <MonthDay label="To" value={w.end} onChange={(v) => edit(w.id, (x) => (x.end = v))} />
                <label className="check">
                  <input type="checkbox" checked={!w.hidden} onChange={(e) => edit(w.id, (x) => (e.target.checked ? delete x.hidden : (x.hidden = true)))} />
                  Show on calendar
                </label>
              </div>

              <div className="season-videos">
                <span className="field-inline">Videos that fit</span>
                <div className="tag-row">
                  {tagged.map((v) => (
                    <span key={v.id} className="tag">
                      {v.kind === 'short' && <span className="mono">SHORT </span>}
                      {v.title}
                      <button onClick={() => tag(w.id, v.id, false)} aria-label={`Untag ${v.title}`}>×</button>
                    </span>
                  ))}
                  {tagged.length === 0 && <span className="muted-note">none yet</span>}
                  <select value="" onChange={(e) => e.target.value && tag(w.id, e.target.value, true)} aria-label={`Tag a video for ${w.name}`}>
                    <option value="">+ tag a video…</option>
                    {untagged.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.kind === 'short' ? 'Short: ' : v.number != null ? `#${v.number} ` : ''}
                        {v.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="season-actions">
                <button className="link danger" onClick={() => remove(w)}>Delete season</button>
              </div>
            </article>
          );
        })}
        {ordered.length === 0 && <p className="hand">no seasons. add one above.</p>}
      </div>
    </section>
  );
}

const fmtYearly = (s: string) => {
  const [m, d] = parts(s);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
};

/** Edits the name locally and saves it when you leave the box or press Enter (not on every keystroke). */
function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const commit = () => {
    const t = text.trim();
    if (t && t !== value) onCommit(t);
    else setText(value);
  };
  return (
    <input
      className="season-name"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Season name"
    />
  );
}
