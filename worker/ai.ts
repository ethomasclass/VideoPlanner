// One place that calls the AI (Claude if an Anthropic key is set, otherwise Gemini) and turns its answer
// (structured JSON) or its errors into something the app can show.
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-opus-5-5';
const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';

export interface AIEnv {
  ANTHROPIC_API_KEY?: string; // Worker secret: use Claude (paid API)
  GEMINI_API_KEY?: string; // Worker secret: use Gemini (has a free tier)
  GEMINI_MODEL?: string; // optional override, e.g. "gemini-pro-latest"
}

export type Provider = 'claude' | 'gemini';
export const providerOf = (env: AIEnv): Provider | null =>
  env.ANTHROPIC_API_KEY ? 'claude' : env.GEMINI_API_KEY ? 'gemini' : null;

interface Ask {
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

export async function askAI<T>(env: AIEnv, opts: Ask): Promise<T> {
  const provider = providerOf(env);
  if (provider === 'claude') return askClaude<T>(env.ANTHROPIC_API_KEY!, opts);
  if (provider === 'gemini') return askGemini<T>(env.GEMINI_API_KEY!, env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL, opts);
  throw new AIError(503, 'No AI is connected yet: add a GEMINI_API_KEY (free tier) or ANTHROPIC_API_KEY secret to the Worker (README, “AI ideas”).', true);
}

export class AIError extends Error {
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

async function askClaude<T>(apiKey: string, opts: Ask): Promise<T> {
  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: opts.system,
      // If a request is declined by a safety check, the API retries it on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: opts.schema } },
      messages: [{ role: 'user', content: opts.user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AIError(502, 'The Anthropic API key was rejected. Check the ANTHROPIC_API_KEY secret.', true);
    if (e instanceof Anthropic.PermissionDeniedError) throw new AIError(502, 'The Anthropic API key isn’t allowed to use this model.');
    if (e instanceof Anthropic.RateLimitError) throw new AIError(429, 'Claude is busy right now (rate limit). Try again in a minute.');
    if (e instanceof Anthropic.BadRequestError) {
      // e.g. "Your credit balance is too low…": show the API's own explanation, not the raw JSON.
      const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
      throw new AIError(502, `Claude couldn’t take the request: ${detail}`);
    }
    if (e instanceof Anthropic.APIError) throw new AIError(502, `Claude had a problem (${e.status}). Try again.`);
    throw new AIError(502, 'Couldn’t reach Claude. Try again.');
  }

  if (response.stop_reason === 'refusal') throw new AIError(422, 'Claude declined that request. Try wording it differently.');
  if (response.stop_reason === 'max_tokens') throw new AIError(502, 'Claude’s answer was cut off. Ask for fewer.');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AIError(502, 'Claude’s answer came back garbled. Try again.');
  }
}

// ---- Gemini (Google AI Studio key; REST, no SDK needed) ----

interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; status?: string; message?: string; details?: { reason?: string }[] };
}

async function askGemini<T>(apiKey: string, model: string, opts: Ask): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: [{ text: opts.user }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: opts.schema, maxOutputTokens: 32768 },
      }),
    });
  } catch {
    throw new AIError(502, 'Couldn’t reach Gemini. Try again.');
  }
  const body = (await res.json().catch(() => ({}))) as GeminiResponse;

  if (!res.ok) {
    const reasons = (body.error?.details ?? []).map((d) => d.reason);
    if (reasons.includes('API_KEY_INVALID') || res.status === 401) {
      throw new AIError(502, 'The Gemini API key was rejected. Check the GEMINI_API_KEY secret.', true);
    }
    if (res.status === 403) throw new AIError(502, 'The Gemini API key isn’t allowed to do this. Check it in Google AI Studio.', true);
    if (res.status === 429) throw new AIError(429, 'Gemini’s free limit is used up for now. Try again in a minute (or tomorrow if it’s the daily limit).');
    if (res.status === 404) throw new AIError(502, `Gemini doesn’t know the model “${model}”.`);
    throw new AIError(502, `Gemini had a problem (${res.status}${body.error?.message ? `: ${body.error.message}` : ''}).`);
  }

  if (body.promptFeedback?.blockReason) throw new AIError(422, 'Gemini declined that request. Try wording it differently.');
  const cand = body.candidates?.[0];
  if (!cand) throw new AIError(502, 'Gemini sent back nothing. Try again.');
  if (cand.finishReason === 'MAX_TOKENS') throw new AIError(502, 'Gemini’s answer was cut off. Ask for fewer.');
  if (cand.finishReason && cand.finishReason !== 'STOP') throw new AIError(422, 'Gemini declined that request. Try wording it differently.');
  const text = (cand.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AIError(502, 'Gemini’s answer came back garbled. Try again.');
  }
}
