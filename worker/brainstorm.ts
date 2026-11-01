// "Brainstorm with Claude": asks Claude for video ideas that fit the channel, as structured JSON.
// The channel context (videos so far, ideas already saved, seasons) is read from the planner in D1,
// so the browser only sends the request text.
import Anthropic from '@anthropic-ai/sdk';
import type { IdeaDraft, Planner } from '../src/types';

const MODEL = 'claude-opus-5-5';

const SYSTEM = `You help plan videos for Chunk History (formerly 15 Minute History), a YouTube channel of history explainers.

The channel:
- Long videos run about 10–16 minutes; Shorts run under 60 seconds and are made natively for vertical, not cut down.
- Mostly American history from the 1700s to the mid-1900s, plus odd and spooky corners of world history, told for a general
  audience that knows nothing about the topic. Plain, quick, conversational narration.
- Every video is built from real archival photographs, engravings, newspapers and documents, so a topic only works if
  plenty of public-domain images exist. Say honestly when they might be thin.
- Stories that do well have a surprising angle on something familiar ("Trick-or-Treating Was a Bribe"), a con or scandal
  with a twist ("They Fooled America's Richest Men"), or a strange true thing people half-know ("When Europe Ate Mummies").

Rules for every idea:
- Titles: under 60 characters, curiosity first, often a question or a paradox. Would someone click it at 11 PM?
- Thumbnail headline: 2–4 words in capitals, a question or a paradox (HERO OR KING?, WHO MADE IT SCARY?, PAID FOR DIRT).
- Hook: the narration's first sentence. It is the hook itself, never a date or "In 1872…". Ideally it describes a real
  document, object or photo the viewer is looking at.
- For Shorts: the first second shows a person or a scene, not text; one surprising fact carries it.
- No modern politicians and no links to today's political parties. Heavy subjects (slavery, war, removal) are welcome but
  are framed seriously, never as a gimmick.
- Don't repeat videos the channel has already made or ideas already saved, and don't propose near-duplicates of them.
- Prefer ideas with a reason to post soon: a season, a holiday, or a round-number anniversary (100th, 150th, 250th…) of
  the event in the coming months. If there's no timely hook, say why it's evergreen.`;

const SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['long', 'short'] },
          concept: { type: 'string', description: 'The idea in one sentence.' },
          hook: { type: 'string', description: 'The first sentence of the narration.' },
          titles: { type: 'array', items: { type: 'string' }, description: 'Three title options, each under 60 characters.' },
          thumbnail: { type: 'string', description: 'A 2–4 word thumbnail headline in capitals.' },
          whyNow: { type: 'string', description: 'The season, holiday or anniversary that makes it timely, or why it is evergreen.' },
          archival: { type: 'string', description: 'What real images and documents likely exist, and any gaps.' },
        },
        required: ['kind', 'concept', 'hook', 'titles', 'thumbnail', 'whyNow', 'archival'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
} as const;

export class BrainstormError extends Error {
  constructor(public status: number, message: string, public setup = false) {
    super(message);
  }
}

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

export async function brainstorm(
  apiKey: string | undefined,
  planner: Planner,
  request: { prompt?: string; count?: number; kind?: 'long' | 'short' },
): Promise<IdeaDraft[]> {
  if (!apiKey) {
    throw new BrainstormError(503, 'Claude isn’t connected yet: add an ANTHROPIC_API_KEY secret to the Worker (README, “Claude ideas”).', true);
  }
  const count = Math.min(Math.max(Math.round(request.count ?? 6), 1), 12);
  const kind = request.kind === 'short' ? 'short' : 'long';
  const ask = (request.prompt ?? '').trim().slice(0, 1000) || 'Whatever you think would do well on the channel next.';
  const today = new Date().toISOString().slice(0, 10);

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      // If a request is declined by a safety check, the API retries it on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `${channelContext(planner, today)}

Give me ${count} ${kind === 'long' ? 'long-video' : 'Short'} ideas. What I'm looking for: ${ask}`,
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new BrainstormError(502, 'The Anthropic API key was rejected. Check the ANTHROPIC_API_KEY secret.', true);
    if (e instanceof Anthropic.PermissionDeniedError) throw new BrainstormError(502, 'The Anthropic API key isn’t allowed to use this model.');
    if (e instanceof Anthropic.RateLimitError) throw new BrainstormError(429, 'Claude is busy right now (rate limit). Try again in a minute.');
    if (e instanceof Anthropic.BadRequestError) {
      // e.g. "Your credit balance is too low…": show the API's own explanation, not the raw JSON.
      const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
      throw new BrainstormError(502, `Claude couldn’t take the request: ${detail}`);
    }
    if (e instanceof Anthropic.APIError) throw new BrainstormError(502, `Claude had a problem (${e.status}). Try again.`);
    throw new BrainstormError(502, 'Couldn’t reach Claude. Try again.');
  }

  if (response.stop_reason === 'refusal') throw new BrainstormError(422, 'Claude declined that request. Try wording it differently.');
  if (response.stop_reason === 'max_tokens') throw new BrainstormError(502, 'Claude’s answer was cut off. Ask for fewer ideas.');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: { ideas: IdeaDraft[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BrainstormError(502, 'Claude’s answer came back garbled. Try again.');
  }
  return parsed.ideas.map((i) => ({ ...i, kind: i.kind === 'short' ? 'short' : 'long' }));
}
