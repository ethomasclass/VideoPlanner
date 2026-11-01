// "Brainstorm with Claude" (video ideas, thumbnail first) and "thumbnail concepts" for one idea.
// The channel context (videos so far, ideas already saved, seasons) is read from the planner in D1,
// so the browser only sends the request.
import type { IdeaDraft, Planner, ThumbDraft } from '../src/types';
import { askClaude, CHANNEL } from './claude';

const THUMB_PROPS = {
  picture: { type: 'string', description: 'What is in the frame: the archival image, and which subject is tinted coral.' },
  headline: { type: 'string', description: 'The 2–4 word headline in capitals for the orange tape.' },
  setup: { type: 'string', description: 'Optional short handwritten setup line above the headline, or an empty string.' },
  title: { type: 'string', description: 'The video title this thumbnail pairs with, under 60 characters.' },
} as const;
const THUMB = { type: 'object', properties: THUMB_PROPS, required: ['picture', 'headline', 'setup', 'title'], additionalProperties: false } as const;

// Property order matters: Claude writes the thumbnail first, then the titles and the rest around it.
const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          thumbnail: THUMB,
          titles: { type: 'array', items: { type: 'string' }, description: 'Three title options, each under 60 characters; the first is the thumbnail’s title.' },
          kind: { type: 'string', enum: ['long', 'short'] },
          concept: { type: 'string', description: 'The idea in one sentence.' },
          hook: { type: 'string', description: 'The first sentence of the narration.' },
          whyNow: { type: 'string', description: 'The season, holiday or anniversary that makes it timely, or why it is evergreen.' },
          archival: { type: 'string', description: 'What real images and documents likely exist, and any gaps.' },
        },
        required: ['thumbnail', 'titles', 'kind', 'concept', 'hook', 'whyNow', 'archival'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
} as const;

const CONCEPTS_SCHEMA = {
  type: 'object',
  properties: { concepts: { type: 'array', items: THUMB } },
  required: ['concepts'],
  additionalProperties: false,
} as const;

const IDEAS_SYSTEM = `${CHANNEL}

How to come up with ideas: work thumbnail first. For each idea, picture the thumbnail before anything else (the archival
image, the coral subject, the 2–4 word headline) and only keep ideas whose thumbnail you'd click. Then write the titles to
pair with it, and the rest.

Rules for every idea:
- Titles: under 60 characters, curiosity first, often a question or a paradox.
- Hook: the narration's first sentence. It is the hook itself, never a date or "In 1872…". Ideally it describes the real
  document, object or photo that is in the thumbnail, so the video opens on what the viewer clicked.
- For Shorts: the first second shows a person or a scene, not text; one surprising fact carries it.
- Don't repeat videos the channel has already made or ideas already saved, and don't propose near-duplicates of them.
- Prefer ideas with a reason to post soon: a season, a holiday, or a round-number anniversary (100th, 150th, 250th…) of
  the event in the coming months. If there's no timely hook, say why it's evergreen.`;

const CONCEPTS_SYSTEM = `${CHANNEL}

You're doing the packaging step for one video, before it's written: thumbnail concepts first, each with the title it pairs
with. Make the concepts genuinely different from each other (different images, subjects and angles: a face, an object, a
before/after, a map, a document), not variations on one headline. Only use images that are likely to exist in the
archives for this topic. Don't repeat concepts that already exist for this idea.`;

function channelContext(planner: Planner, today: string): string {
  const videos = planner.videos
    .filter((v) => v.kind === 'long')
    .map((v) => `- ${v.title}${v.subtitle ? `: ${v.subtitle}` : ''} (${v.status.replace('-', ' ')})`)
    .join('\n');
  const shorts = planner.videos.filter((v) => v.kind === 'short').map((v) => `- ${v.title}`).join('\n');
  const ideas = planner.ideas.map((i) => `- ${i.concept}`).join('\n') || '(none yet)';
  const windows = planner.windows.map((w) => `- ${w.name}: ${w.start} to ${w.end}`).join('\n');
  return `Today is ${today}.

Long videos the channel has made or is making:
${videos}

Shorts so far:
${shorts}

Ideas already saved (don't repeat these):
${ideas}

Seasons the channel plans around (month-day):
${windows}`;
}

const clampCount = (n: unknown, def: number) => Math.min(Math.max(Math.round(Number(n) || def), 1), 12);

export async function brainstorm(
  apiKey: string | undefined,
  planner: Planner,
  request: { prompt?: string; count?: number; kind?: 'long' | 'short' },
): Promise<IdeaDraft[]> {
  const count = clampCount(request.count, 6);
  const kind = request.kind === 'short' ? 'short' : 'long';
  const ask = (request.prompt ?? '').trim().slice(0, 1000) || 'Whatever you think would do well on the channel next.';
  const today = new Date().toISOString().slice(0, 10);
  const out = await askClaude<{ ideas: IdeaDraft[] }>(apiKey, {
    system: IDEAS_SYSTEM,
    schema: IDEAS_SCHEMA,
    user: `${channelContext(planner, today)}

Give me ${count} ${kind === 'long' ? 'long-video' : 'Short'} ideas. What I'm looking for: ${ask}`,
  });
  return out.ideas.map((i) => ({ ...i, kind: i.kind === 'short' ? 'short' : 'long' }));
}

export async function thumbnailConcepts(
  apiKey: string | undefined,
  request: { concept?: string; hook?: string; titles?: string[]; kind?: 'long' | 'short'; existing?: string[]; count?: number },
): Promise<ThumbDraft[]> {
  const concept = (request.concept ?? '').trim().slice(0, 1000);
  if (!concept) throw new Error('No idea given');
  const count = clampCount(request.count, 5);
  const lines = [
    `The ${request.kind === 'short' ? 'Short' : 'video'}: ${concept}`,
    request.hook && `Planned hook: ${request.hook.slice(0, 500)}`,
    request.titles?.length && `Title ideas so far: ${request.titles.slice(0, 6).join(' · ').slice(0, 600)}`,
    request.existing?.length && `Thumbnail concepts it already has (don't repeat):\n${request.existing.slice(0, 12).map((e) => `- ${e.slice(0, 300)}`).join('\n')}`,
  ].filter(Boolean);
  const out = await askClaude<{ concepts: ThumbDraft[] }>(apiKey, {
    system: CONCEPTS_SYSTEM,
    schema: CONCEPTS_SCHEMA,
    user: `${lines.join('\n')}

Give me ${count} thumbnail concepts, each with its title.`,
  });
  return out.concepts;
}
