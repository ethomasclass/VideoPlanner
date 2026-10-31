import type { Planner } from '../types.ts';
import { PHASES } from '../types.ts';
import { addDays, fmtShort, fromISO, todayISO } from '../lib/dates.ts';
import { buffer, openLongSlots, videoById } from '../lib/schedule.ts';

const phaseIndex = (id: string) => PHASES.findIndex((p) => p.id === id);

export default function Sidebar({ planner }: { planner: Planner }) {
  const today = todayISO();
  const banked = buffer(planner);
  const open = openLongSlots(planner, 6);
  const target = planner.settings.bufferTarget;

  const upNext = planner.releases
    .filter((r) => r.date >= today)
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    .slice(0, 5);

  const inProduction = planner.videos
    .filter((v) => v.kind === 'long' && v.phase !== 'published')
    .sort((a, b) => phaseIndex(b.phase) - phaseIndex(a.phase));
  const releaseOf = (id: string) => planner.releases.find((r) => r.videoId === id);

  const waitingOnMe = planner.videos.flatMap((v) =>
    (v.waitingOn ?? []).filter((w) => w.who === 'me').map((w) => ({ video: v, what: w.what })),
  );

  // Release windows starting in the next 60 days (this year or next).
  const horizon = addDays(today, 60);
  const upcomingWindows = planner.windows
    .map((w) => {
      const y = fromISO(today).getFullYear();
      let start = `${y}-${w.start}`;
      if (`${y}-${w.end}` < today) start = `${y + 1}-${w.start}`;
      const end = `${start.slice(0, 4)}-${w.end}`;
      return { ...w, startDate: start, endDate: end, now: start <= today };
    })
    .filter((w) => w.startDate <= horizon)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <aside className="sidebar">
      <div className="tiles">
        <div className={`tile${banked.length === 0 ? ' alert' : ''}`}>
          <span className="tile-num">{banked.length}</span>
          <span className="mono">WEEKS BANKED</span>
          <small>target {target}: finished videos waiting for a slot</small>
        </div>
        <div className={`tile${open.length > 0 ? ' alert' : ''}`}>
          <span className="tile-num">{open.length}</span>
          <span className="mono">OPEN LONG SLOTS</span>
          <small>in the next 6 weeks</small>
        </div>
      </div>

      {waitingOnMe.length > 0 && (
        <section>
          <h3 className="tape small">Waiting on you</h3>
          <ul className="list">
            {waitingOnMe.map(({ video, what }, i) => (
              <li key={i}>
                <span className="dot" /> <b>{video.title}</b>
                <small>{what}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

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
        <h3 className="tape small">In production</h3>
        <ul className="list">
          {inProduction.map((v) => {
            const r = releaseOf(v.id);
            return (
              <li key={v.id}>
                <span className="phase-pill">{PHASES[phaseIndex(v.phase)]?.label}</span>
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
