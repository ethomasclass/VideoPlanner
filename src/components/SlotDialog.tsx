import { useState } from 'react';
import type { CadenceSlot, Planner, Release, Video } from '../types.ts';
import { fmtShort } from '../lib/dates.ts';
import { longVideoOfWeek, newId, releaseAt, suggestEvergreens } from '../lib/schedule.ts';

interface Props {
  planner: Planner;
  date: string;
  slot: CadenceSlot;
  update: (change: (draft: Planner) => void) => void;
  onClose: () => void;
}

export default function SlotDialog({ planner, date, slot, update, onClose }: Props) {
  const existing = releaseAt(planner, date, slot.kind);
  const isEvergreen = slot.kind === 'evergreen';
  const isShort = slot.kind === 'shortA' || slot.kind === 'shortB';
  const weekLong = isShort ? longVideoOfWeek(planner, date) : undefined;

  const [pick, setPick] = useState(isEvergreen ? existing?.promotesId ?? '' : existing?.videoId ?? '');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [time, setTime] = useState(existing?.time ?? slot.time);
  const [status, setStatus] = useState<Release['status']>(existing?.status ?? 'planned');
  const [newTitle, setNewTitle] = useState('');

  // Things already booked into another slot are left out of the list.
  const bookedElsewhere = new Set(
    planner.releases.filter((r) => r !== existing && r.videoId).map((r) => r.videoId as string),
  );

  let options: Video[];
  if (isEvergreen) {
    const suggested = suggestEvergreens(planner, [date]).get(date);
    options = planner.videos
      .filter((v) => v.kind === 'long' && v.status === 'published')
      .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    if (suggested) options = [suggested, ...options.filter((v) => v.id !== suggested.id)];
  } else {
    const kind = slot.kind === 'long' ? 'long' : 'short';
    options = planner.videos.filter(
      (v) => v.kind === kind && (v.id === pick || (v.status !== 'published' && !bookedElsewhere.has(v.id))),
    );
    // Shorts from this week's long video first.
    if (weekLong) options.sort((a, b) => Number(b.parentId === weekLong.id) - Number(a.parentId === weekLong.id));
  }

  const save = () => {
    update((p) => {
      let videoId = isEvergreen ? undefined : pick || undefined;
      if (!isEvergreen && !pick && newTitle.trim()) {
        const v: Video = {
          id: newId(slot.kind === 'long' ? 'video' : 'short'),
          kind: slot.kind === 'long' ? 'long' : 'short',
          title: newTitle.trim(),
          status: 'idea',
          parentId: isShort ? weekLong?.id : undefined,
        };
        p.videos.push(v);
        videoId = v.id;
      }
      const rel: Release = {
        id: existing?.id ?? newId('rel'),
        date,
        slot: slot.kind,
        time,
        videoId,
        promotesId: isEvergreen ? pick || undefined : undefined,
        label: label.trim() || undefined,
        status,
      };
      p.releases = p.releases.filter((r) => r.id !== rel.id);
      p.releases.push(rel);
      // Marking it published also marks the video published.
      const v = p.videos.find((x) => x.id === videoId);
      if (v && status === 'published') {
        v.status = 'published';
        v.publishedAt = date;
      }
    });
    onClose();
  };

  const clear = () => {
    update((p) => {
      p.releases = p.releases.filter((r) => r.id !== existing?.id);
    });
    onClose();
  };

  const nothingChosen = !pick && !newTitle.trim() && !label.trim();

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit slot">
        <h2 className="tape small">{slot.label}</h2>
        <p className="mono">{fmtShort(date).toUpperCase()}</p>

        <label className="field">
          <span>{isEvergreen ? 'Which older video does this Short point to?' : 'What goes out'}</span>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{isEvergreen ? '— choose a video —' : '— nothing linked yet —'}</option>
            {options.map((v, i) => (
              <option key={v.id} value={v.id}>
                {isEvergreen && i === 0 && !existing ? '★ ' : ''}
                {v.number != null ? `#${v.number} ` : ''}
                {v.title}
                {v.status !== 'published' ? ` (${v.status.replace('-', ' ')})` : ''}
              </option>
            ))}
          </select>
          {isEvergreen && !existing && options[0] && (
            <small className="hint">★ suggested: the one that fits the season, or was promoted longest ago</small>
          )}
        </label>

        {!isEvergreen && !pick && (
          <label className="field">
            <span>
              …or plan a new {slot.kind === 'long' ? 'video' : 'Short'}
              {weekLong ? ` (from ${weekLong.title})` : ''}
            </span>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="working title" />
          </label>
        )}

        <label className="field">
          <span>{isEvergreen ? 'Short title or hook' : 'Note'}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" />
        </label>

        <div className="row">
          <label className="field">
            <span>Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as Release['status'])}>
              <option value="planned">Planned</option>
              <option value="scheduled">Scheduled on YouTube</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>

        <div className="actions">
          {existing && (
            <button className="link danger" onClick={clear}>
              Clear slot
            </button>
          )}
          <span className="spacer" />
          <button className="link" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={save} disabled={nothingChosen}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
