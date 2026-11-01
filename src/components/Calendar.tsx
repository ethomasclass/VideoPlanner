import { useMemo, useState } from 'react';
import type { CadenceSlot, Planner, YouTubeData, YTVideo } from '../types.ts';
import { compact, ytDay, ytUrl } from '../lib/youtube.ts';
import { STATUSES } from '../types.ts';
import { MONTHS, addDays, fmtShort, fromISO, monthGrid, todayISO } from '../lib/dates.ts';
import { releaseAt, slotsToShow, suggestEvergreens, videoById, windowsOn, newId } from '../lib/schedule.ts';
import SlotDialog from './SlotDialog.tsx';
import { leadThumb } from './ThumbStrip.tsx';
import { imageSrc } from '../lib/images.ts';

interface Props {
  planner: Planner;
  update: (change: (draft: Planner) => void) => void;
  yt?: YouTubeData | null;
  onEditSchedule?: () => void;
}

const KIND_TAG = { long: 'LONG', shortA: 'SHORT A', shortB: 'SHORT B', evergreen: 'EVERGREEN' } as const;

export default function Calendar({ planner, update, yt, onEditSchedule }: Props) {
  const now = fromISO(todayISO());
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [editing, setEditing] = useState<{ date: string; slot: CadenceSlot } | null>(null);

  const weeks = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const suggestions = useMemo(() => suggestEvergreens(planner, weeks.flat()), [planner, weeks]);
  const ytById = useMemo(() => new Map((yt?.videos ?? []).map((v) => [v.id, v])), [yt]);
  const ytByDay = useMemo(() => {
    const m = new Map<string, YTVideo[]>();
    for (const v of yt?.videos ?? []) m.set(ytDay(v), [...(m.get(ytDay(v)) ?? []), v]);
    return m;
  }, [yt]);
  const today = todayISO();
  const soon = addDays(today, 14);

  const shift = (n: number) =>
    setYm(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  const acceptSuggestion = (date: string, slot: CadenceSlot, videoId: string) =>
    update((p) => {
      p.releases.push({ id: newId('rel'), date, slot: slot.kind, time: slot.time, promotesId: videoId, status: 'planned' });
    });

  // One cadence slot on one day: a booked release, a suggestion (Mondays), or an empty slot.
  const renderSlot = (date: string, slot: CadenceSlot) => {
    const past = date < today;
    const rel = releaseAt(planner, date, slot.kind);
    const video = videoById(planner, rel?.videoId);
    const promotes = videoById(planner, rel?.promotesId);
    const open = () => setEditing({ date, slot });

    if (rel) {
      const title =
        video?.title ?? (promotes ? `Short from ${promotes.title}` : rel.label || 'Untitled');
      return (
        <button key={slot.kind} className={`chip ${slot.kind} ${rel.status}`} onClick={open}>
          {(() => {
            const img = leadThumb(video?.thumbs)?.image;
            const ytv = video?.youtubeId ? ytById.get(video.youtubeId) : undefined;
            const src = img ? imageSrc(img) : slot.kind === 'long' ? ytv?.thumb : undefined;
            return src ? <img className="chip-thumb" src={src} alt="" loading="lazy" /> : null;
          })()}
          <span className="chip-tag">
            {KIND_TAG[slot.kind]} · {rel.time ?? slot.time}
            {rel.status !== 'planned' && ` · ${rel.status.toUpperCase()}`}
            {video?.youtubeId && ytById.has(video.youtubeId) && ` · ${compact(ytById.get(video.youtubeId)!.views)} VIEWS`}
          </span>
          <span className="chip-title">{title}</span>
          {video && (video.status === 'idea' || video.status === 'in-progress') && (
            <span className="chip-phase">
              {STATUSES.find((s) => s.id === video.status)?.label.toLowerCase()}
            </span>
          )}
        </button>
      );
    }

    const suggestion = suggestions.get(date);
    if (slot.kind === 'evergreen' && suggestion) {
      return (
        <div key={slot.kind} className="chip ghost">
          <span className="chip-tag">EVERGREEN · SUGGESTED</span>
          <span className="chip-title">{suggestion.title}</span>
          <span className="ghost-actions">
            <button onClick={() => acceptSuggestion(date, slot, suggestion.id)}>use</button>
            <button onClick={open}>pick…</button>
          </span>
        </div>
      );
    }

    if (past) return null; // an empty slot in the past is just clutter
    const urgent = slot.kind === 'long' && date <= soon;
    return (
      <button
        key={slot.kind}
        className={`chip empty${urgent ? ' urgent' : ''}`}
        onClick={open}
      >
        + {slot.label.toLowerCase()}
      </button>
    );
  };

  // Uploads YouTube shows on this day that aren't already a release chip on the calendar.
  const renderUploads = (date: string) =>
    (ytByDay.get(date) ?? [])
      .filter((v) => !planner.releases.some((r) => r.date === date && videoById(planner, r.videoId)?.youtubeId === v.id))
      .map((v) => (
        <a key={v.id} className={`chip yt-chip${v.isShort ? ' short' : ''}`} href={ytUrl(v)} target="_blank" rel="noreferrer" title={v.title}>
          {!v.isShort && <img className="chip-thumb" src={v.thumb} alt="" loading="lazy" />}
          <span className="chip-tag">{v.isShort ? 'SHORT' : 'LONG'} · LIVE · {compact(v.views)} VIEWS</span>
          <span className="chip-title">{v.title}</span>
        </a>
      ));

  return (
    <section className="calendar">
      <div className="cal-head">
        <h1 className="tape">
          {MONTHS[ym.m]} {ym.y}
        </h1>
        <div className="cal-nav">
          <button onClick={() => shift(-1)} aria-label="Previous month">←</button>
          <button onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>
          <button onClick={() => shift(1)} aria-label="Next month">→</button>
          {onEditSchedule && <button onClick={onEditSchedule} title="Change posting days and times">Schedule</button>}
        </div>
      </div>

      <div className="grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="dow">{d}</div>
        ))}
        {weeks.flat().map((date) => {
          const inMonth = fromISO(date).getMonth() === ym.m;
          const past = date < today;
          const windows = windowsOn(planner, date).filter((w) => !w.hidden);
          return (
            <div
              key={date}
              className={`day${inMonth ? '' : ' out'}${past ? ' past' : ''}${date === today ? ' today' : ''}`}
            >
              <div className="day-top">
                <span className="day-num">{fromISO(date).getDate()}</span>
                {windows.map((w) =>
                  // Name the window on its first day and at the start of each week; a thin bar elsewhere.
                  date.slice(5) === w.start || fromISO(date).getDay() === 1 || date === weeks[0][0] ? (
                    <span key={w.id} className="window" title={w.name}>{w.name}</span>
                  ) : (
                    <span key={w.id} className="window-bar" title={w.name} />
                  ),
                )}
              </div>
              {slotsToShow(planner, date).map((slot) => renderSlot(date, slot))}
{renderUploads(date)}
            </div>
          );
        })}
      </div>

      {/* Phones: the same slots as a week-by-week list (CSS shows one or the other). */}
      <div className="agenda">
        {weeks.map((week) => {
          const days = week.filter((d) => fromISO(d).getMonth() === ym.m && (slotsToShow(planner, d).length > 0 || ytByDay.has(d)));
          if (days.length === 0) return null;
          return (
            <div key={week[0]} className="agenda-week">
              <div className="mono agenda-week-label">WEEK OF {fmtShort(week[0]).toUpperCase()}</div>
              {days.map((date) => (
                <div key={date} className={`agenda-day${date < today ? ' past' : ''}${date === today ? ' today' : ''}`}>
                  <div className="agenda-date">
                    <span className="mono">{fromISO(date).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
                    <span className="agenda-num">{fromISO(date).getDate()}</span>
                  </div>
                  <div className="agenda-slots">
                    {windowsOn(planner, date).some((w) => !w.hidden) && (
                      <div className="agenda-windows">
                        {windowsOn(planner, date).filter((w) => !w.hidden).map((w) => (
                          <span key={w.id} className="window">{w.name}</span>
                        ))}
                      </div>
                    )}
                    {slotsToShow(planner, date).map((slot) => renderSlot(date, slot))}
{renderUploads(date)}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {editing && (
        <SlotDialog
          planner={planner}
          date={editing.date}
          slot={editing.slot}
          update={update}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
