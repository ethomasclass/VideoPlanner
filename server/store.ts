import fs from 'node:fs/promises';
import path from 'node:path';
import type { Planner } from '../src/types.ts';

const FILE = path.resolve('data/planner.json');

export async function load(): Promise<Planner> {
  return JSON.parse(await fs.readFile(FILE, 'utf8'));
}

// Saves run one at a time, in the order they arrive.
let queue: Promise<void> = Promise.resolve();

export function save(planner: Planner): Promise<void> {
  const run = queue.then(() => write(planner));
  queue = run.catch(() => {});
  return run;
}

// Write to a temp file and rename, so a crash mid-write never leaves a half-written planner.json.
async function write(planner: Planner): Promise<void> {
  if (planner?.version !== 1 || !Array.isArray(planner.videos) || !Array.isArray(planner.releases)) {
    throw new Error('Refusing to save: not a planner document');
  }
  const tmp = FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(planner, null, 2) + '\n');
  await fs.rename(tmp, FILE);
}
