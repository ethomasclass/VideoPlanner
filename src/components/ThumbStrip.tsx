import { useState } from 'react';
import type { Thumb, ThumbDraft } from '../types.ts';
import { newId } from '../lib/schedule.ts';
import { deleteImage, imageSrc, uploadImage } from '../lib/images.ts';
import { ApiError } from '../lib/api.ts';
import { useAI } from '../lib/ai.ts';

interface Props {
  thumbs: Thumb[];
  onChange: (next: Thumb[]) => void;
  /** When given, shows "ask <AI> for 5 concepts". */
  onAskClaude?: () => Promise<ThumbDraft[]>;
}

/** A thumbnail as it would look: the uploaded image, or a mock of the concept in the channel's style. */
export function ThumbFrame({ thumb, small }: { thumb: Thumb; small?: boolean }) {
  if (thumb.image) {
    return (
      <div className={`thumb-frame${small ? ' small' : ''}`}>
        <img src={imageSrc(thumb.image)} alt={thumb.headline ?? 'Thumbnail'} loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`thumb-frame mock${small ? ' small' : ''}`}>
      <div className="mock-text">
        {thumb.setup && <span className="mock-setup">{thumb.setup.toLowerCase()}</span>}
        {thumb.headline && <span className="mock-headline">{thumb.headline}</span>}
      </div>
      {!small && thumb.picture && <p className="mock-picture">{thumb.picture}</p>}
    </div>
  );
}

export default function ThumbStrip({ thumbs, onChange, onAskClaude }: Props) {
  const ai = useAI();
  const [busy, setBusy] = useState<string | null>(null); // thumb id being uploaded, 'new', or 'ai'
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ headline: string; picture: string; title: string } | null>(null);

  const choose = (id: string) => onChange(thumbs.map((t) => ({ ...t, chosen: t.id === id ? !t.chosen : false })));

  const attach = async (target: Thumb | null, file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(target?.id ?? 'new');
    try {
      const image = await uploadImage(file);
      if (target) {
        if (target.image) deleteImage(target.image);
        onChange(thumbs.map((t) => (t.id === target.id ? { ...t, image } : t)));
      } else {
        onChange([...thumbs, { id: newId('thumb'), image, chosen: thumbs.length === 0 }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = (t: Thumb) => {
    if (!confirm(t.image ? 'Remove this thumbnail and its image?' : 'Remove this thumbnail concept?')) return;
    if (t.image) deleteImage(t.image);
    onChange(thumbs.filter((x) => x.id !== t.id));
  };

  const ask = async () => {
    if (!onAskClaude) return;
    setError('');
    setBusy('ai');
    try {
      const concepts = await onAskClaude();
      onChange([...thumbs, ...concepts.map((c) => ({ ...c, setup: c.setup || undefined, id: newId('thumb'), chosen: false }))]);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const addConcept = () => {
    if (!form || !(form.headline.trim() || form.picture.trim())) return;
    onChange([
      ...thumbs,
      {
        id: newId('thumb'),
        headline: form.headline.trim().toUpperCase() || undefined,
        picture: form.picture.trim() || undefined,
        title: form.title.trim() || undefined,
        chosen: thumbs.length === 0,
      },
    ]);
    setForm(null);
  };

  return (
    <div className="thumb-strip">
      <div className="thumb-grid">
        {thumbs.map((t) => (
          <div key={t.id} className={`thumb${t.chosen ? ' chosen' : ''}`}>
            <ThumbFrame thumb={t} />
            {t.title && <p className="thumb-title">{t.title}</p>}
            {t.image && t.picture && <p className="thumb-picture">{t.picture}</p>}
            <div className="thumb-actions">
              <button
                className={`star${t.chosen ? ' on' : ''}`}
                onClick={() => choose(t.id)}
                title={t.chosen ? 'Chosen' : 'Choose this one'}
                aria-label={t.chosen ? 'Chosen thumbnail' : 'Choose this thumbnail'}
              >
                {t.chosen ? '★' : '☆'}
              </button>
              <label className="link small-link">
                {busy === t.id ? 'uploading…' : t.image ? 'Replace image' : 'Add image'}
                <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => { attach(t, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <span className="spacer" />
              <button className="link danger small-link" onClick={() => remove(t)}>Remove</button>
            </div>
          </div>
        ))}

        <div className="thumb add-tile">
          <label className="add-option">
            {busy === 'new' ? 'uploading…' : '+ upload an image'}
            <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => { attach(null, e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className="add-option" onClick={() => setForm(form ? null : { headline: '', picture: '', title: '' })}>
            + write a concept
          </button>
          {onAskClaude && (
            <button className="add-option" onClick={ask} disabled={!!busy}>
              {busy === 'ai' ? `${ai.name.toLowerCase()} is thinking…` : `+ ask ${ai.name.toLowerCase()} for 5 concepts`}
            </button>
          )}
        </div>
      </div>

      {form && (
        <div className="concept-form">
          <label className="field">
            <span>Headline (2–4 words)</span>
            <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="e.g. PAID FOR DIRT" />
          </label>
          <label className="field">
            <span>What's in the picture</span>
            <input value={form.picture} onChange={(e) => setForm({ ...form, picture: e.target.value })} placeholder="the image, and who's in coral" />
          </label>
          <label className="field">
            <span>Title it pairs with</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <div className="actions">
            <span className="spacer" />
            <button className="link" onClick={() => setForm(null)}>Cancel</button>
            <button className="primary small" onClick={addConcept} disabled={!(form.headline.trim() || form.picture.trim())}>Add concept</button>
          </div>
        </div>
      )}
      {error && <p className="error-note">{error}</p>}
    </div>
  );
}

/** The chosen thumbnail (or the first one). */
export const leadThumb = (thumbs?: Thumb[]) => thumbs?.find((t) => t.chosen) ?? thumbs?.[0];
