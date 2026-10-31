import type { CadenceSlot, Planner, Release, ReleaseWindow, SlotKind, Video } from '../types.ts';
import { addDays, fromISO, todayISO, weekStart } from './dates.ts';

export const SLOT_ORDER: SlotKind[] = ['long', 'shortA', 'shortB', 'evergreen'];

export const slotsOn = (p: Planner, date: string): CadenceSlot[] =>
  p.settings.cadence
    .filter((c) => c.weekday === fromISO(date).getDay())
    .sort((a, b) => SLOT_ORDER.indexOf(a.kind) - SLOT_ORDER.indexOf(b.kind));

export const releaseAt = (p: Planner, date: string, slot: SlotKind): Release | undefined =>
  p.releases.find((r) => r.date === date && r.slot === slot);

export const videoById = (p: Planner, id?: string): Video | undefined =>
  id ? p.videos.find((v) => v.id === id) : undefined;

/** Windows (World Series, spooky season…) that cover the date. Handles windows that wrap the new year. */
export function windowsOn(p: Planner, date: string): ReleaseWindow[] {
  const md = date.slice(5);
  return p.windows.filter((w) => (w.start <= w.end ? md >= w.start && md <= w.end : md >= w.start || md <= w.end));
}

/** The long video planned for the week containing the date (Short A/B usually come from it). */
export function longVideoOfWeek(p: Planner, date: string): Video | undefined {
  const mon = weekStart(date);
  const r = p.releases.find((r) => r.slot === 'long' && r.date >= mon && r.date <= addDays(mon, 6));
  return videoById(p, r?.videoId);
}

/**
 * Evergreen rotation: for each open evergreen slot, suggest an older long video.
 * A video that fits a release window on that date comes first; otherwise the one promoted longest ago
 * (never promoted counts as oldest). Nothing is suggested twice within 8 weeks.
 */
export function suggestEvergreens(p: Planner, dates: string[]): Map<string, Video> {
  const lastPromoted = new Map<string, string>();
  for (const r of p.releases) {
    if (r.slot === 'evergreen' && r.promotesId) {
      const prev = lastPromoted.get(r.promotesId);
      if (!prev || r.date > prev) lastPromoted.set(r.promotesId, r.date);
    }
  }
  const pool = p.videos.filter((v) => v.kind === 'long' && v.status === 'published');
  const out = new Map<string, Video>();
  const today = todayISO();
  for (const date of [...dates].sort()) {
    if (date < today) continue;
    if (!slotsOn(p, date).some((s) => s.kind === 'evergreen')) continue;
    if (releaseAt(p, date, 'evergreen')) continue;
    const active = new Set(windowsOn(p, date).map((w) => w.id));
    const tooRecent = (v: Video) => {
      const last = lastPromoted.get(v.id);
      return !!last && Math.abs(fromISO(date).getTime() - fromISO(last).getTime()) < 56 * 864e5;
    };
    const ranked = pool
      .filter((v) => !tooRecent(v))
      .sort((a, b) => {
        const sa = a.seasons?.some((s) => active.has(s)) ? 1 : 0;
        const sb = b.seasons?.some((s) => active.has(s)) ? 1 : 0;
        if (sa !== sb) return sb - sa;
        const la = lastPromoted.get(a.id) ?? '';
        const lb = lastPromoted.get(b.id) ?? '';
        if (la !== lb) return la < lb ? -1 : 1;
        return (a.number ?? 0) - (b.number ?? 0);
      });
    const pick = ranked[0];
    if (pick) {
      out.set(date, pick);
      lastPromoted.set(pick.id, date);
    }
  }
  return out;
}

/** Long videos being made or ready that have no release date yet. */
export function unscheduled(p: Planner): Video[] {
  const booked = new Set(p.releases.map((r) => r.videoId));
  return p.videos.filter((v) => v.kind === 'long' && v.status !== 'published' && v.status !== 'idea' && !booked.has(v.id));
}

/** Open long-video slots in the next n weeks. */
export function openLongSlots(p: Planner, weeks = 6): string[] {
  const out: string[] = [];
  const start = todayISO();
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    if (slotsOn(p, d).some((s) => s.kind === 'long') && !releaseAt(p, d, 'long')?.videoId) out.push(d);
  }
  return out;
}

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
