import type { Planner } from '../types.ts';
import { STATUSES } from '../types.ts';
import { addDays, fmtShort, todayISO } from '../lib/dates.ts';
import { nextOccurrence, openLongSlots, unscheduled, videoById } from '../lib/schedule.ts';

const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id;

export default function Sidebar({ planner }: { planner: Planner }) {
  const today = todayISO();
  const open = openLongSlots(planner, 6);
  const noDate = unscheduled(planner);

  const upNext = planner.releases
    .filter((r) => r.date >= today)
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    .slice(0, 6);

  const inProgress = planner.videos.filter((v) => v.kind === 'long' && (v.status === 'in-progress' || v.status === 'ready'));
  const releaseOf = (id: string) => planner.releases.find((r) => r.videoId === id);

  // Release windows that are on now or start in the next 60 days.
  const horizon = addDays(today, 60);
  const upcomingWindows = planner.windows
    .map((w) => {
      const o = nextOccurrence(w, today);
      return { ...w, startDate: o.start, endDate: o.end, now: o.now };
    })
    .filter((w) => w.startDate <= horizon)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <aside className="sidebar">
      <div className="tiles">
        <div className={`tile${open.length > 0 ? ' alert' : ''}`}>
          <span className="tile-num">{open.length}</span>
          <span className="mono">OPEN LONG SLOTS</span>
          <small>in the next 6 weeks</small>
        </div>
        <div className="tile">
          <span className="tile-num">{noDate.length}</span>
          <span className="mono">NO DATE YET</span>
          <small>videos in progress or ready, not on the calendar</small>
        </div>
      </div>

      <section>
        <h3 className="tape small">Up next</h3>
        {upNext.length === 0 ? (
          <p className="hand">nothing on the calendar yet. click an empty slot to plan one.</p>
        ) : (
          <ul className="list">
            {upNext.map((r) => {
              const v = videoById(planner, r.videoId);
              const pr = videoById(planner, r.promotesId);
              return (
                <li key={r.id}>
                  <span className="mono">{fmtShort(r.date).toUpperCase()}</span>
                  <b>{v?.title ?? (pr ? `Short from ${pr.title}` : r.label ?? 'Untitled')}</b>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="tape small">In progress</h3>
        <ul className="list">
          {inProgress.map((v) => {
            const r = releaseOf(v.id);
            return (
              <li key={v.id}>
                <span className="phase-pill">{statusLabel(v.status)}</span>
                <b>{v.title}</b>
                <small className={r ? '' : 'unscheduled'}>{r ? `out ${fmtShort(r.date)}` : 'no date yet'}</small>
              </li>
            );
          })}
        </ul>
      </section>

      {upcomingWindows.length > 0 && (
        <section>
          <h3 className="tape small">Coming up</h3>
          <ul className="list">
            {upcomingWindows.map((w) => (
              <li key={w.id}>
                <span className="mono">
                  {w.now ? `NOW · UNTIL ${fmtShort(w.endDate).toUpperCase()}` : fmtShort(w.startDate).toUpperCase()}
                </span>
                <b>{w.name}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
