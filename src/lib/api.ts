import type { Planner } from '../types.ts';

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
