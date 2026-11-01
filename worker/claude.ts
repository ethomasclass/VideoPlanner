// One place that calls Claude and turns its answer (structured JSON) or its errors into something the app can show.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';

export class ClaudeError extends Error {
  constructor(public status: number, message: string, public setup = false) {
    super(message);
  }
}

export const CHANNEL = `You help plan videos for Chunk History (formerly 15 Minute History), a YouTube channel of history explainers.

The channel:
- Long videos run about 10–16 minutes; Shorts run under 60 seconds and are made natively for vertical, not cut down.
- Mostly American history from the 1700s to the mid-1900s, plus odd and spooky corners of world history, told for a general
  audience that knows nothing about the topic. Plain, quick, conversational narration.
- Every video is built from real archival photographs, engravings, newspapers and documents, so a topic only works if
  plenty of public-domain images exist. Say honestly when they might be thin.
- Stories that do well have a surprising angle on something familiar ("Trick-or-Treating Was a Bribe"), a con or scandal
  with a twist ("They Fooled America's Richest Men"), or a strange true thing people half-know ("When Europe Ate Mummies").
- No modern politicians and no links to today's political parties. Heavy subjects (slavery, war, removal) are welcome but
  are framed seriously, never as a gimmick.

The channel's thumbnail formula (1280×720):
- One black-and-white archival photo or engraving, big. One subject in it is tinted coral and traced with a loose teal
  outline: the person or thing the video is about. Everything else stays black and white.
- A headline of 2–4 words in heavy serif capitals on torn strips of orange tape: a question or a paradox
  (HERO OR KING?, WHO MADE IT SCARY?, PAID FOR DIRT, 1921 BANNED / 2026 PARTNER).
- Optionally, a short handwritten teal setup line above the headline ("The time America wanted to" / FIX EVERYTHING).
- The channel logo sits small in the top-left; the bottom-right corner stays clear (YouTube's duration badge).
- It must read at phone size: one clear subject, a big face or object, high contrast, few words.
- The title and thumbnail work as a pair: the title doesn't repeat the headline, it adds the other half of the curiosity.
- The test: would someone scrolling at 11 PM stop and click?`;

export async function askClaude<T>(
  apiKey: string | undefined,
  opts: { system: string; user: string; schema: Record<string, unknown> },
): Promise<T> {
  if (!apiKey) {
    throw new ClaudeError(503, 'Claude isn’t connected yet: add an ANTHROPIC_API_KEY secret to the Worker (README, “Claude ideas”).', true);
  }
  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: opts.system,
      // If a request is declined by a safety check, the API retries it on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: opts.schema } },
      messages: [{ role: 'user', content: opts.user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError(502, 'The Anthropic API key was rejected. Check the ANTHROPIC_API_KEY secret.', true);
    if (e instanceof Anthropic.PermissionDeniedError) throw new ClaudeError(502, 'The Anthropic API key isn’t allowed to use this model.');
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeError(429, 'Claude is busy right now (rate limit). Try again in a minute.');
    if (e instanceof Anthropic.BadRequestError) {
      // e.g. "Your credit balance is too low…": show the API's own explanation, not the raw JSON.
      const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
      throw new ClaudeError(502, `Claude couldn’t take the request: ${detail}`);
    }
    if (e instanceof Anthropic.APIError) throw new ClaudeError(502, `Claude had a problem (${e.status}). Try again.`);
    throw new ClaudeError(502, 'Couldn’t reach Claude. Try again.');
  }

  if (response.stop_reason === 'refusal') throw new ClaudeError(422, 'Claude declined that request. Try wording it differently.');
  if (response.stop_reason === 'max_tokens') throw new ClaudeError(502, 'Claude’s answer was cut off. Ask for fewer.');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ClaudeError(502, 'Claude’s answer came back garbled. Try again.');
  }
}
