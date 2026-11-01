// Your posting schedule: which days have which slots, at what time, and what each slot is called.
import { useState } from 'react';
import type { CadenceSlot, Planner, SlotKind, YouTubeData } from '../types.ts';
import { DEFAULT_CADENCE, SLOT_ORDER } from '../lib/schedule.ts';
import { DEFAULT_SLOT_LABEL } from '../lib/ideas.ts';
import { fromISO } from '../lib/dates.ts';
import { easternWeekday, perDay, ytDay } from '../lib/youtube.ts';

interface Props {
  planner: Planner;
  update: (change: (draft: Planner) => void) => void;
  yt: YouTubeData | null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const KIND_HELP: Record<SlotKind, string> = {
  long: 'a long video',
  shortA: 'a Short (usually from that week’s video)',
  shortB: 'a second Short',
  evergreen: 'a Short from an older video (gets suggestions)',
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default function Schedule({ planner, update, yt }: Props) {
  const cadence = planner.settings.cadence;
  const [error, setError] = useState('');

  /** Applies a change to the schedule, refusing two slots of the same type on the same day. */
  const change = (fn: (c: CadenceSlot[]) => CadenceSlot[]) => {
    const next = fn(cadence.map((c) => ({ ...c })));
    const seen = new Set<string>();
    for (const c of next) {
      const key = `${c.weekday}-${c.kind}`;
      if (seen.has(key)) {
        setError(`${DAYS[c.weekday]} already has a “${DEFAULT_SLOT_LABEL[c.kind]}” slot. Pick another day or type.`);
        return;
      }
      seen.add(key);
    }
    setError('');
    update((p) => {
      p.settings.cadence = next;
    });
  };
  const edit = (i: number, patch: Partial<CadenceSlot>) => change((c) => c.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => change((c) => c.filter((_, k) => k !== i));
  const add = () => {
    // A free day/type combination for the new slot: a Short on the first day that doesn't have one.
    const kind: SlotKind = 'shortA';
    const day = WEEK.find((d) => !cadence.some((c) => c.weekday === d && c.kind === kind)) ?? 3;
    change((c) => [...c, { kind, label: 'Short', weekday: day, time: '12:00' }]);
  };
  const reset = () => {
    if (!confirm('Go back to the starting schedule (Mon evergreen Short, Tue long video, Thu and Sat Shorts)?')) return;
    change(() => DEFAULT_CADENCE.map((c) => ({ ...c })));
  };

  const order = cadence
    .map((c, i) => ({ c, i }))
    .sort((a, b) => WEEK.indexOf(a.c.weekday) - WEEK.indexOf(b.c.weekday) || SLOT_ORDER.indexOf(a.c.kind) - SLOT_ORDER.indexOf(b.c.kind) || a.c.time.localeCompare(b.c.time));
  const perWeek = {
    long: cadence.filter((c) => c.kind === 'long').length,
    short: cadence.filter((c) => c.kind !== 'long').length,
  };

  // How your uploads have done by the day they went live (views per day since posting, median).
  // With Analytics connected you can count only North American viewers, by the day in US Eastern time.
  const an = yt?.analytics;
  const hasRegions = !!an && Object.keys(an.videos).length > 0;
  const region = hasRegions ? (planner.settings.dayStatsRegion ?? 'na') : 'all';
  const setRegion = (r: 'all' | 'na' | 'na-mx') => update((p) => void (p.settings.dayStatsRegion = r));
  const dayStats = (short: boolean) => {
    const vids = (yt?.videos ?? []).filter((v) => v.isShort === short && Date.now() - Date.parse(v.publishedAt) > 2 * 864e5);
    return WEEK.map((d) => {
      const xs = vids
        .filter((v) => (region === 'all' ? fromISO(ytDay(v)).getDay() : easternWeekday(v)) === d)
        .flatMap((v) => {
          if (region === 'all') return [perDay(v)];
          const a = an?.videos[v.id];
          if (!a) return [];
          const views = a.naViews + (region === 'na-mx' ? a.mxViews : 0);
          return [views / Math.max(1, (Date.now() - Date.parse(v.publishedAt)) / 864e5)];
        });
      return { d, n: xs.length, m: median(xs) };
    });
  };
  const longDays = dayStats(false);
  const shortDays = dayStats(true);
  const maxLong = Math.max(1, ...longDays.map((x) => x.m));
  const maxShort = Math.max(1, ...shortDays.map((x) => x.m));

  return (
    <section className="schedule">
      <div className="seasons-intro">
        <h1 className="tape">Schedule</h1>
        <p className="hand">
          your weekly posting slots. change a day, time, name or type, add slots, or remove them. releases you've already
          booked stay on their dates.
        </p>
      </div>

      <div className="week-preview">
        {WEEK.map((d) => {
          const slots = cadence.filter((c) => c.weekday === d).sort((a, b) => a.time.localeCompare(b.time));
          return (
            <div key={d} className={`week-day${slots.length ? '' : ' empty'}`}>
              <span className="mono">{DAYS[d].slice(0, 3).toUpperCase()}</span>
              {slots.map((c) => (
                <span key={c.kind} className={`week-slot ${c.kind}`}>
                  <b>{c.label}</b> {c.time}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted-note">
        {perWeek.long} long video{perWeek.long === 1 ? '' : 's'} and {perWeek.short} Short{perWeek.short === 1 ? '' : 's'} a week.
      </p>

      <div className="panel">
        <div className="panel-head">
          <h2 className="tape small">Slots</h2>
          <button className="link" onClick={reset}>Reset to the starting schedule</button>
        </div>
        <div className="slot-rows">
          <div className="slot-row head">
            <span>Name</span><span>Type</span><span>Day</span><span>Time</span><span />
          </div>
          {order.map(({ c, i }) => (
            <div key={`${c.weekday}-${c.kind}-${i}`} className="slot-row">
              <LabelInput key={c.label} value={c.label} onSave={(label) => edit(i, { label })} />
              <select aria-label="Slot type" value={c.kind} onChange={(e) => edit(i, { kind: e.target.value as SlotKind })} title={KIND_HELP[c.kind]}>
                {SLOT_ORDER.map((k) => <option key={k} value={k}>{DEFAULT_SLOT_LABEL[k]}</option>)}
              </select>
              <select aria-label="Day" value={c.weekday} onChange={(e) => edit(i, { weekday: Number(e.target.value) })}>
                {WEEK.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
              </select>
              <input aria-label="Time" type="time" value={c.time} onChange={(e) => e.target.value && edit(i, { time: e.target.value })} />
              <button className="icon-btn danger" onClick={() => remove(i)} aria-label={`Remove ${c.label}`} title="Remove this slot">×</button>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="add-option" onClick={add}>+ add a slot</button>
        </div>
        {error && <p className="error-note">{error}</p>}
        <small className="muted-note">
          Types: <b>Long video</b> for the week's video; <b>Short A / Short B</b> for Shorts (they offer that week's video as
          the source); <b>Evergreen Short</b> for a Short from an older video, with suggestions. Each day can have one slot of each
          type. Times are in your local time.
        </small>
      </div>

      <div className="panel">
        <h2 className="tape small">What your channel says</h2>
        {!yt?.videos.length ? (
          <p className="muted-note">Connect YouTube (Stats tab) to see which days your uploads do best.</p>
        ) : (
          <>
            <div className="region-row">
              <span className="field-inline">Count views from</span>
              <div className="filters">
                {([['all', 'Everyone'], ['na', 'US + Canada'], ['na-mx', 'US + Canada + Mexico']] as const).map(([k, label]) => (
                  <button key={k} className={`filter${region === k ? ' on' : ''}`} disabled={!hasRegions && k !== 'all'} onClick={() => setRegion(k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted-note">
              {region === 'all'
                ? 'Median views per day since posting, by the day each upload went live (your local time).'
                : `Median ${region === 'na' ? 'US + Canada' : 'US, Canada + Mexico'} views per day since posting, by the day each upload went live in US Eastern time.`}{' '}
              {!hasRegions && 'Connect YouTube Analytics (Stats tab) to count only North American viewers. '}
              With only a few uploads per day this is a hint, not a rule.
            </p>
            <div className="day-bars">
              <DayBars title="Long videos" rows={longDays} max={maxLong} />
              <DayBars title="Shorts" rows={shortDays} max={maxShort} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function DayBars({ title, rows, max }: { title: string; rows: { d: number; n: number; m: number }[]; max: number }) {
  return (
    <div className="bars">
      <span className="mono">{title.toUpperCase()}</span>
      {rows.map((r) => (
        <div key={r.d} className="bar-row">
          <span className="bar-day">{DAYS[r.d].slice(0, 3)}</span>
          <span className="bar-track">
            {r.n > 0 && <span className="bar-fill" style={{ width: `${Math.max(4, (r.m / max) * 100)}%` }} />}
          </span>
          <span className="bar-val">{r.n ? `${r.m.toFixed(r.m < 10 ? 1 : 0)} /day` : '–'}</span>
          <span className="bar-n mono">{r.n ? `${r.n}×` : ''}</span>
        </div>
      ))}
    </div>
  );
}

function LabelInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      aria-label="Slot name"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text.trim() && text.trim() !== value ? onSave(text.trim()) : setText(value))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
