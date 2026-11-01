import { useEffect, useState } from 'react';

export type Provider = 'claude' | 'gemini';

// Which AI the Worker is connected to (asked once per page load).
let cached: Promise<Provider | null> | null = null;
const load = () =>
  (cached ??= fetch('/api/ai')
    .then((r) => (r.ok ? r.json() : { provider: null }))
    .then((b) => (b.provider ?? null) as Provider | null)
    .catch(() => null));

export const aiLabel = (p: Provider | null) => (p === 'claude' ? 'Claude' : p === 'gemini' ? 'Gemini' : 'AI');

/** The connected AI, for button labels and for tagging where ideas came from. */
export function useAI(): { provider: Provider | null; name: string } {
  const [provider, setProvider] = useState<Provider | null>(null);
  useEffect(() => {
    load().then(setProvider);
  }, []);
  return { provider, name: aiLabel(provider) };
}
