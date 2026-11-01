// Helpers shared by the Ideas list and an idea's planning page.
import type { Idea, Planner, SlotKind, Thumb, Video } from '../types.ts';
import { addDays, todayISO } from './dates.ts';
import { newId, releaseAt, slotsOn } from './schedule.ts';
import { leadThumb } from '../components/ThumbStrip.tsx';

export const DEFAULT_SLOT_LABEL: Record<SlotKind, string> = {
  long: 'Long video',
  shortA: 'Short A',
  shortB: 'Short B',
  evergreen: 'Evergreen Short',
};

/** Open calendar slots in the next 12 weeks that suit an idea of this kind. */
export function openSlotsFor(p: Planner, kind: Idea['kind']) {
  const kinds: SlotKind[] = kind === 'long' ? ['long'] : ['shortA', 'shortB', 'evergreen'];
  const out: { date: string; slot: SlotKind; time: string }[] = [];
  const today = todayISO();
  for (let i = 0; i < 84; i++) {
    const date = addDays(today, i);
    for (const s of slotsOn(p, date)) {
      if (kinds.includes(s.kind) && !releaseAt(p, date, s.kind)) out.push({ date, slot: s.kind, time: s.time });
    }
  }
  return out;
}

/** The name you gave a slot kind in your schedule (e.g. "Long video"). */
export const slotLabel = (p: Planner, kind: SlotKind) =>
  p.settings.cadence.find((c) => c.kind === kind)?.label ?? DEFAULT_SLOT_LABEL[kind];

/** Thumbnails of an idea, including the single headline older ideas had. */
export const ideaThumbs = (idea: Idea): Thumb[] =>
  idea.thumbs ?? (idea.thumbnail ? [{ id: `${idea.id}-t`, headline: idea.thumbnail, chosen: true }] : []);

export function videoFromIdea(idea: Idea): Video {
  const thumbs = ideaThumbs(idea);
  const title = leadThumb(thumbs)?.title?.trim() || idea.titles?.[0]?.trim() || idea.concept;
  const otherTitles = (idea.titles ?? []).filter((t) => t !== title);
  const notes = [
    otherTitles.length > 0 && `Other titles: ${otherTitles.join(' · ')}`,
    idea.hook && `Hook: ${idea.hook}`,
    idea.whyNow && `Why now: ${idea.whyNow}`,
    idea.archival && `Images: ${idea.archival}`,
    idea.notes,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    id: newId(idea.kind === 'long' ? 'video' : 'short'),
    kind: idea.kind,
    title,
    subtitle: title === idea.concept ? undefined : idea.concept,
    status: 'idea',
    notes: notes || undefined,
    thumbs: thumbs.length ? thumbs : undefined,
  };
}

