import type { IdeaDraft, Planner, ThumbDraft } from '../types.ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public setup = false,
    public rev?: number,
  ) {
    super(message);
  }
}

async function call<T>(init?: RequestInit): Promise<T> {
  const res = await fetch('/api/planner', { ...init, headers: { 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText, body.setup, body.rev);
  return body as T;
}

export const loadPlanner = () => call<{ planner: Planner; rev: number }>();

/** Saves the planner on top of revision baseRev. Returns the new revision; throws ApiError 409 if it changed elsewhere. */
export const savePlanner = (planner: Planner, baseRev: number) =>
  call<{ rev: number }>({ method: 'PUT', body: JSON.stringify({ planner, baseRev }) }).then((r) => r.rev);

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.setup);
  return data as T;
}

export const brainstormIdeas = (req: { prompt: string; count: number; kind: 'long' | 'short' }) =>
  postJSON<{ ideas: IdeaDraft[] }>('/api/brainstorm', req).then((r) => r.ideas);

export const thumbnailConcepts = (req: { concept: string; hook?: string; titles?: string[]; kind: 'long' | 'short'; existing: string[] }) =>
  postJSON<{ concepts: ThumbDraft[] }>('/api/thumbnails', req).then((r) => r.concepts);
