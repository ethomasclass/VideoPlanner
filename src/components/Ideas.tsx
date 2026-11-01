import { useMemo, useState } from 'react';
import type { Idea, IdeaDraft, Planner, Release, SlotKind, Video } from '../types.ts';
import { ApiError, brainstormIdeas } from '../lib/api.ts';
import { addDays, fmtShort, fromISO, todayISO } from '../lib/dates.ts';
import { newId, releaseAt, slotsOn, videoById } from '../lib/schedule.ts';

interface Props {
  planner: Planner;
  update: (change: (draft: Planner) => void) => void;
}

const SLOT_LABEL: Record<SlotKind, string> = {
  long: 'Long video',
  shortA: 'Short A',
  shortB: 'Short B',
  evergreen: 'Evergreen Short',
};

/** Open calendar slots in the next 12 weeks that suit an idea of this kind. */
function openSlotsFor(p: Planner, kind: Idea['kind']) {
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

function videoFromIdea(idea: Idea): Video {
  const title = idea.titles?.[0]?.trim() || idea.concept;
  const notes = [
    idea.titles && idea.titles.length > 1 && `Other titles: ${idea.titles.slice(1).join(' · ')}`,
    idea.hook && `Hook: ${idea.hook}`,
    idea.thumbnail && `Thumbnail: ${idea.thumbnail}`,
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
  };
}

export default function Ideas({ planner, update }: Props) {
  // Brainstorm
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<Idea['kind']>('long');
  const [count, setCount] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [drafts, setDrafts] = useState<IdeaDraft[]>([]);

  // Your own idea
  const [ownOpen, setOwnOpen] = useState(false);
  const [own, setOwn] = useState({ concept: '', hook: '', titles: '', notes: '', kind: 'long' as Idea['kind'] });

  const [filter, setFilter] = useState<'open' | 'starred' | 'used'>('open');

  const chips = useMemo(() => {
    // The next season starting at least two weeks out: too late to plan for anything sooner.
    const from = addDays(todayISO(), 14);
    const y = fromISO(from).getFullYear();
    const next = planner.windows
      .map((w) => ({ w, start: `${y}-${w.start}` < from ? `${y + 1}-${w.start}` : `${y}-${w.start}` }))
      .sort((a, b) => a.start.localeCompare(b.start))[0]?.w;
    const lastMade = [...planner.videos].filter((v) => v.kind === 'long' && v.number != null).sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0];
    return [
      next && `Something for ${next.name}`,
      'Anniversaries in the next six months',
      lastMade && `More like “${lastMade.title}”`,
      'A con, hoax or scandal with a twist',
      'A strange true thing people half-know',
    ].filter(Boolean) as string[];
  }, [planner]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setDrafts(await brainstormIdeas({ prompt, count, kind }));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      setLoading(false);
    }
  };

  const saveDrafts = (list: IdeaDraft[]) => {
    update((p) => {
      for (const d of list) p.ideas.push({ ...d, id: newId('idea'), source: 'claude', createdAt: todayISO() });
    });
    setDrafts((ds) => ds.filter((d) => !list.includes(d)));
  };

  const addOwn = () => {
    if (!own.concept.trim()) return;
    update((p) => {
      p.ideas.push({
        id: newId('idea'),
        kind: own.kind,
        concept: own.concept.trim(),
        hook: own.hook.trim() || undefined,
        titles: own.titles.split('\n').map((t) => t.trim()).filter(Boolean),
        notes: own.notes.trim() || undefined,
        source: 'me',
        createdAt: todayISO(),
      });
    });
    setOwn({ concept: '', hook: '', titles: '', notes: '', kind: own.kind });
  };

  const ideas = [...planner.ideas].reverse(); // newest first
  const shown = ideas.filter((i) =>
    filter === 'used' ? i.videoId : filter === 'starred' ? i.starred && !i.videoId : !i.videoId,
  );
  const counts = {
    open: ideas.filter((i) => !i.videoId).length,
    starred: ideas.filter((i) => i.starred && !i.videoId).length,
    used: ideas.filter((i) => i.videoId).length,
  };

  return (
    <section className="ideas">
      <div className="ideas-tools">
        <div className="panel">
          <h2 className="tape small">Brainstorm with Claude</h2>
          <label className="field">
            <span>What are you looking for?</span>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. something spooky but true for next October, or a Short about a weird law"
            />
          </label>
          <div className="chip-row">
            {chips.map((c) => (
              <button key={c} className="suggest" onClick={() => setPrompt(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="row">
            <label className="field">
              <span>Kind</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as Idea['kind'])}>
                <option value="long">Long videos</option>
                <option value="short">Shorts</option>
              </select>
            </label>
            <label className="field">
              <span>How many</span>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[3, 6, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary" onClick={run} disabled={loading}>
            {loading ? 'Thinking…' : 'Brainstorm'}
          </button>
          {loading && <p className="hand">claude is thinking. this usually takes under a minute.</p>}
          {error && (
            <p className={`error-note${error.setup ? ' setup' : ''}`}>{error.message}</p>
          )}
        </div>

        {!ownOpen ? (
          <button className="add-own" onClick={() => setOwnOpen(true)}>+ add your own idea</button>
        ) : (
        <div className="panel">
          <div className="panel-head">
            <h2 className="tape small">Add your own</h2>
            <button className="link" onClick={() => setOwnOpen(false)}>Close</button>
          </div>
          <label className="field">
            <span>The idea in one line</span>
            <input value={own.concept} onChange={(e) => setOwn({ ...own, concept: e.target.value })} placeholder="required" />
          </label>
          <label className="field">
            <span>Hook (optional)</span>
            <input value={own.hook} onChange={(e) => setOwn({ ...own, hook: e.target.value })} />
          </label>
          <label className="field">
            <span>Title ideas, one per line (optional)</span>
            <textarea rows={2} value={own.titles} onChange={(e) => setOwn({ ...own, titles: e.target.value })} />
          </label>
          <label className="field">
            <span>Notes (optional)</span>
            <textarea rows={2} value={own.notes} onChange={(e) => setOwn({ ...own, notes: e.target.value })} />
          </label>
          <div className="row">
            <label className="field">
              <span>Kind</span>
              <select value={own.kind} onChange={(e) => setOwn({ ...own, kind: e.target.value as Idea['kind'] })}>
                <option value="long">Long video</option>
                <option value="short">Short</option>
              </select>
            </label>
            <button className="primary align-end" onClick={addOwn} disabled={!own.concept.trim()}>
              Save idea
            </button>
          </div>
        </div>
        )}
      </div>

      <div className="ideas-list">
        {drafts.length > 0 && (
          <div className="drafts">
            <div className="list-head">
              <h2 className="tape small">From Claude</h2>
              <button className="link" onClick={() => saveDrafts(drafts)}>Save all</button>
              <button className="link" onClick={() => setDrafts([])}>Dismiss all</button>
            </div>
            {drafts.map((d, i) => (
              <IdeaCard key={i} idea={d} draft>
                <button className="primary small" onClick={() => saveDrafts([d])}>Save</button>
                <button className="link" onClick={() => setDrafts((ds) => ds.filter((x) => x !== d))}>Dismiss</button>
              </IdeaCard>
            ))}
          </div>
        )}

        <div className="list-head">
          <h2 className="tape small">Your ideas</h2>
          <div className="filters">
            {(['open', 'starred', 'used'] as const).map((f) => (
              <button key={f} className={`filter${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'open' ? 'Not planned' : f === 'starred' ? '★ Starred' : 'Planned'} <span className="mono">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 && (
          <p className="hand">
            {filter === 'open'
              ? 'no ideas yet. brainstorm a few with claude, or add your own.'
              : filter === 'starred'
                ? 'star the ideas you like best and they collect here.'
                : 'ideas you put on the calendar show up here.'}
          </p>
        )}
        {shown.map((idea) => (
          <SavedIdea key={idea.id} idea={idea} planner={planner} update={update} />
        ))}
      </div>
    </section>
  );
}

function IdeaCard({ idea, draft, children }: { idea: IdeaDraft | Idea; draft?: boolean; children?: React.ReactNode }) {
  return (
    <article className={`idea-card${draft ? ' draft' : ''}`}>
      <div className="idea-top">
        <span className="mono">{idea.kind === 'long' ? 'LONG VIDEO' : 'SHORT'}</span>
        {idea.thumbnail && <span className="thumb-tape">{idea.thumbnail}</span>}
      </div>
      <h3 className="idea-concept">{idea.concept}</h3>
      {idea.hook && <p className="idea-hook">“{idea.hook}”</p>}
      {idea.titles && idea.titles.length > 0 && (
        <ul className="idea-titles">
          {idea.titles.map((t) => (
            <li key={t}>
              {t} <span className={`mono${t.length > 60 ? ' over' : ''}`}>{t.length}</span>
            </li>
          ))}
        </ul>
      )}
      {(idea.whyNow || idea.archival || ('notes' in idea && idea.notes)) && (
        <dl className="idea-meta">
          {idea.whyNow && (<><dt>Why now</dt><dd>{idea.whyNow}</dd></>)}
          {idea.archival && (<><dt>Images</dt><dd>{idea.archival}</dd></>)}
          {'notes' in idea && idea.notes && (<><dt>Notes</dt><dd>{idea.notes}</dd></>)}
        </dl>
      )}
      <div className="idea-actions">{children}</div>
    </article>
  );
}

function SavedIdea({ idea, planner, update }: { idea: Idea; planner: Planner; update: Props['update'] }) {
  const [choice, setChoice] = useState('');
  const slots = useMemo(() => openSlotsFor(planner, idea.kind), [planner, idea.kind]);
  const video = videoById(planner, idea.videoId);
  const release = video && planner.releases.find((r) => r.videoId === video.id);

  const edit = (change: (i: Idea) => void) =>
    update((p) => {
      const i = p.ideas.find((x) => x.id === idea.id);
      if (i) change(i);
    });

  const plan = () => {
    if (!choice) return;
    update((p) => {
      const i = p.ideas.find((x) => x.id === idea.id);
      if (!i) return;
      const v = videoFromIdea(i);
      p.videos.push(v);
      i.videoId = v.id;
      if (choice !== 'nodate') {
        const [date, slot] = choice.split('|') as [string, SlotKind];
        const time = slots.find((s) => s.date === date && s.slot === slot)?.time;
        const rel: Release = { id: newId('rel'), date, slot, time, videoId: v.id, status: 'planned' };
        p.releases.push(rel);
      }
    });
    setChoice('');
  };

  const remove = () => {
    if (!confirm('Delete this idea?')) return;
    update((p) => {
      p.ideas = p.ideas.filter((x) => x.id !== idea.id);
    });
  };

  return (
    <IdeaCard idea={idea}>
      <button
        className={`star${idea.starred ? ' on' : ''}`}
        onClick={() => edit((i) => (i.starred = !i.starred))}
        aria-label={idea.starred ? 'Unstar' : 'Star'}
        title={idea.starred ? 'Unstar' : 'Star'}
      >
        {idea.starred ? '★' : '☆'}
      </button>
      {video ? (
        <span className="planned-note">
          {release ? `on the calendar: ${fmtShort(release.date)} · ${SLOT_LABEL[release.slot]}` : 'made into a video (no date yet)'}
        </span>
      ) : (
        <span className="plan">
          <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Plan this idea">
            <option value="">Plan it…</option>
            <option value="nodate">Make it a video, no date yet</option>
            {slots.map((s) => (
              <option key={s.date + s.slot} value={`${s.date}|${s.slot}`}>
                {fmtShort(s.date)} · {SLOT_LABEL[s.slot]}
              </option>
            ))}
          </select>
          <button className="primary small" onClick={plan} disabled={!choice}>Plan</button>
        </span>
      )}
      <span className="spacer" />
      <span className="mono">{idea.source === 'claude' ? 'CLAUDE' : 'YOU'} · {fmtShort(idea.createdAt).toUpperCase()}</span>
      <button className="link danger" onClick={remove}>Delete</button>
    </IdeaCard>
  );
}
