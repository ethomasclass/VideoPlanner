// The full planning page for one idea: every field the AI (or you) filled in, editable, plus planning it onto
// the calendar. Text saves when you leave a box, not on every keystroke.
import { useMemo, useState } from 'react';
import type { Idea, Planner, Release, SlotKind, Status, Thumb } from '../types.ts';
import { STATUSES } from '../types.ts';
import { fmtShort } from '../lib/dates.ts';
import { newId, videoById } from '../lib/schedule.ts';
import { ideaThumbs, openSlotsFor, slotLabel, videoFromIdea } from '../lib/ideas.ts';
import { thumbnailConcepts } from '../lib/api.ts';
import ThumbStrip from './ThumbStrip.tsx';

interface Props {
  planner: Planner;
  ideaId: string;
  update: (change: (draft: Planner) => void) => void;
  onBack: () => void;
}

/** An input or textarea that keeps its own text while you type and saves on blur (or Enter for one-liners). */
function Field({
  value,
  onSave,
  multiline,
  rows = 3,
  placeholder,
  className,
  label,
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  label: string;
}) {
  const [text, setText] = useState(value);
  const commit = () => {
    if (text.trim() !== value.trim()) onSave(text.trim());
  };
  return multiline ? (
    <textarea aria-label={label} className={className} rows={rows} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  ) : (
    <input
      aria-label={label}
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export default function IdeaPage({ planner, ideaId, update, onBack }: Props) {
  const idea = planner.ideas.find((i) => i.id === ideaId);
  const video = videoById(planner, idea?.videoId);
  const release = video && planner.releases.find((r) => r.videoId === video.id);
  const slots = useMemo(() => (idea ? openSlotsFor(planner, idea.kind) : []), [planner, idea]);
  const [choice, setChoice] = useState('');
  const [newLink, setNewLink] = useState({ label: '', url: '' });

  if (!idea) {
    return (
      <section className="idea-page">
        <button className="link back" onClick={onBack}>← Ideas</button>
        <p className="hand">that idea isn't here any more.</p>
      </section>
    );
  }

  const edit = (change: (i: Idea) => void) =>
    update((p) => {
      const i = p.ideas.find((x) => x.id === idea.id);
      if (i) change(i);
    });
  const editVideo = (change: (v: NonNullable<typeof video>) => void) =>
    update((p) => {
      const v = video && p.videos.find((x) => x.id === video.id);
      if (v) change(v);
    });
  const setText = (key: 'concept' | 'hook' | 'whyNow' | 'archival' | 'notes' | 'outline') => (v: string) =>
    edit((i) => {
      if (key === 'concept') i.concept = v || i.concept;
      else if (v) i[key] = v;
      else delete i[key];
    });

  // Thumbnails live on the video once the idea is planned (the calendar edits the same set).
  const thumbs = video ? (video.thumbs ?? []) : ideaThumbs(idea);
  const setThumbs = (next: Thumb[]) =>
    update((p) => {
      const v = video && p.videos.find((x) => x.id === video.id);
      if (v) v.thumbs = next;
      else {
        const i = p.ideas.find((x) => x.id === idea.id);
        if (i) {
          i.thumbs = next;
          delete i.thumbnail;
        }
      }
    });

  const titles = idea.titles ?? [];
  const setTitles = (next: string[]) => edit((i) => (i.titles = next.filter((t) => t.trim())));
  const moveTitle = (from: number, to: number) => {
    const next = [...titles];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    setTitles(next);
  };

  const links = idea.links ?? [];
  const addLink = () => {
    let url = newLink.url.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    edit((i) => (i.links = [...(i.links ?? []), { url, label: newLink.label.trim() || undefined }]));
    setNewLink({ label: '', url: '' });
  };

  const plan = () => {
    if (!choice) return;
    update((p) => {
      const i = p.ideas.find((x) => x.id === idea.id);
      if (!i) return;
      let vid = i.videoId;
      if (!vid) {
        const v = videoFromIdea(i);
        p.videos.push(v);
        i.videoId = vid = v.id;
      }
      p.releases = p.releases.filter((r) => r.videoId !== vid || r.status === 'published');
      if (choice !== 'nodate') {
        const [date, slot] = choice.split('|') as [string, SlotKind];
        const time = slots.find((s) => s.date === date && s.slot === slot)?.time;
        const rel: Release = { id: newId('rel'), date, slot, time, videoId: vid, status: 'planned' };
        p.releases.push(rel);
      }
    });
    setChoice('');
  };

  const removeDate = () =>
    update((p) => {
      p.releases = p.releases.filter((r) => r.videoId !== video?.id || r.status === 'published');
    });

  // Undo "Plan it": only for a video that hasn't gone anywhere yet.
  const canUnplan = video && !video.youtubeId && video.status !== 'published';
  const unplan = () => {
    if (!video || !confirm('Turn this back into just an idea? Its video and calendar date are removed; the idea keeps everything else.')) return;
    update((p) => {
      const v = p.videos.find((x) => x.id === video.id);
      const i = p.ideas.find((x) => x.id === idea.id);
      if (i) {
        if (v?.thumbs?.length) i.thumbs = v.thumbs;
        delete i.videoId;
      }
      p.videos = p.videos.filter((x) => x.id !== video.id);
      p.releases = p.releases.filter((r) => r.videoId !== video.id);
    });
  };

  const remove = () => {
    if (!confirm(video ? 'Delete this idea? Its video stays on your calendar.' : 'Delete this idea?')) return;
    update((p) => {
      p.ideas = p.ideas.filter((x) => x.id !== idea.id);
    });
    onBack();
  };

  const askAI = () =>
    thumbnailConcepts({
      concept: idea.concept,
      hook: idea.hook,
      titles: idea.titles,
      kind: idea.kind,
      existing: thumbs.map((t) => [t.headline, t.picture].filter(Boolean).join(': ')),
    });

  return (
    <section className="idea-page">
      <div className="idea-page-head">
        <button className="link back" onClick={onBack}>← Ideas</button>
        <span className="mono">
          {idea.source === 'me' ? 'YOUR IDEA' : `FROM ${idea.source.toUpperCase()}`} · {fmtShort(idea.createdAt).toUpperCase()}
        </span>
        <span className="spacer" />
        <button className={`star${idea.starred ? ' on' : ''}`} onClick={() => edit((i) => (i.starred = !i.starred))} title={idea.starred ? 'Starred' : 'Star it'}>
          {idea.starred ? '★' : '☆'}
        </button>
        <button className="link danger" onClick={remove}>Delete idea</button>
      </div>

      <div className="page-block">
        <label className="field">
          <span>The idea</span>
          <Field key={`c${idea.concept}`} label="The idea" className="big-field" value={idea.concept} onSave={setText('concept')} multiline rows={2} />
        </label>
        <div className="row">
          <label className="field shrink">
            <span>Kind</span>
            <select value={idea.kind} onChange={(e) => edit((i) => (i.kind = e.target.value as Idea['kind']))} disabled={!!video}>
              <option value="long">Long video</option>
              <option value="short">Short</option>
            </select>
          </label>
        </div>
      </div>

      <div className="page-block">
        <h2 className="tape small">Thumbnails</h2>
        <p className="hand small-hand">thumbnail first: ★ the one you're going with.</p>
        <ThumbStrip thumbs={thumbs} onChange={setThumbs} onAskClaude={askAI} />
      </div>

      <div className="page-grid">
        <div className="page-block">
          <h2 className="tape small">Titles</h2>
          <ol className="title-list">
            {titles.map((t, n) => (
              <li key={`${n}-${t}`}>
                <Field label={`Title ${n + 1}`} value={t} onSave={(v) => setTitles(titles.map((x, k) => (k === n ? v : x)))} />
                <span className={`mono count${t.length > 60 ? ' over' : ''}`}>{t.length}</span>
                <button className="icon-btn" onClick={() => moveTitle(n, n - 1)} disabled={n === 0} aria-label="Move up">↑</button>
                <button className="icon-btn" onClick={() => moveTitle(n, n + 1)} disabled={n === titles.length - 1} aria-label="Move down">↓</button>
                {video && video.title !== t && (
                  <button className="link small-link" onClick={() => editVideo((v) => (v.title = t))}>use</button>
                )}
                <button className="icon-btn danger" onClick={() => setTitles(titles.filter((_, k) => k !== n))} aria-label="Remove title">×</button>
              </li>
            ))}
          </ol>
          <Field key={`new-title-${titles.length}`} label="Add a title" value="" placeholder="+ add a title (Enter)" onSave={(v) => v && setTitles([...titles, v])} />
          <small className="muted-note">Under 60 characters shows in full on YouTube; the first title pairs with the thumbnail.</small>
        </div>

        <div className="page-block">
          <h2 className="tape small">Hook</h2>
          <Field key={`h${idea.hook}`} label="Hook" value={idea.hook ?? ''} onSave={setText('hook')} multiline rows={3} placeholder="the first sentence: the hook itself, never a date" />
          <h2 className="tape small">Why now</h2>
          <Field key={`w${idea.whyNow}`} label="Why now" value={idea.whyNow ?? ''} onSave={setText('whyNow')} multiline rows={2} placeholder="a season, an anniversary, or why it's evergreen" />
        </div>
      </div>

      <div className="page-grid">
        <div className="page-block">
          <h2 className="tape small">Outline</h2>
          <Field key={`o${idea.outline}`} label="Outline" value={idea.outline ?? ''} onSave={setText('outline')} multiline rows={8} placeholder={'cold open: …\nthe question: …\nch 2: …\nthe twist: …\nending: …'} />
        </div>
        <div className="page-block">
          <h2 className="tape small">Images &amp; sources</h2>
          <Field key={`a${idea.archival}`} label="Archival images" value={idea.archival ?? ''} onSave={setText('archival')} multiline rows={3} placeholder="what real photos, engravings and documents exist" />
          <ul className="link-items">
            {links.map((l, n) => (
              <li key={`${n}-${l.url}`}>
                <a href={l.url} target="_blank" rel="noreferrer">{l.label || l.url}</a>
                <button className="icon-btn danger" onClick={() => edit((i) => (i.links = links.filter((_, k) => k !== n)))} aria-label="Remove link">×</button>
              </li>
            ))}
          </ul>
          <div className="link-add">
            <input aria-label="Link label" placeholder="label (optional)" value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} />
            <input aria-label="Link URL" placeholder="https://…" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
            <button className="primary small" onClick={addLink} disabled={!newLink.url.trim()}>Add link</button>
          </div>
        </div>
      </div>

      <div className="page-block">
        <h2 className="tape small">Notes</h2>
        <Field key={`n${idea.notes}`} label="Notes" value={idea.notes ?? ''} onSave={setText('notes')} multiline rows={4} />
      </div>

      <div className="page-block plan-block">
        <h2 className="tape small">Plan it</h2>
        {video ? (
          <>
            <div className="row">
              <label className="field">
                <span>Video title</span>
                <Field key={`vt${video.title}`} label="Video title" value={video.title} onSave={(v) => v && editVideo((x) => (x.title = v))} />
              </label>
              <label className="field shrink">
                <span>Status</span>
                <select value={video.status} onChange={(e) => editVideo((x) => (x.status = e.target.value as Status))}>
                  {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <p className="plan-when">
              {release ? (
                <>On the calendar: <b>{fmtShort(release.date)}</b> · {slotLabel(planner, release.slot)}{release.time ? ` · ${release.time}` : ''}</>
              ) : (
                'No date yet.'
              )}
            </p>
            {release?.status !== 'published' && (
              <div className="plan">
                <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Choose a date">
                  <option value="">{release ? 'Move to…' : 'Put it on the calendar…'}</option>
                  {slots.map((s) => (
                    <option key={s.date + s.slot} value={`${s.date}|${s.slot}`}>{fmtShort(s.date)} · {slotLabel(planner, s.slot)}</option>
                  ))}
                </select>
                <button className="primary small" onClick={plan} disabled={!choice}>{release ? 'Move' : 'Add'}</button>
                {release && <button className="link" onClick={removeDate}>Remove date</button>}
              </div>
            )}
            {canUnplan && <button className="link danger unplan" onClick={unplan}>Turn back into just an idea</button>}
          </>
        ) : (
          <div className="plan">
            <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Plan this idea">
              <option value="">Choose a date…</option>
              <option value="nodate">Make it a video, no date yet</option>
              {slots.map((s) => (
                <option key={s.date + s.slot} value={`${s.date}|${s.slot}`}>{fmtShort(s.date)} · {slotLabel(planner, s.slot)}</option>
              ))}
            </select>
            <button className="primary small" onClick={plan} disabled={!choice}>Plan</button>
          </div>
        )}
      </div>
    </section>
  );
}
