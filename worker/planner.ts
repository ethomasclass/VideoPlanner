// The whole planner is one JSON document in one D1 row. Every save carries the revision it was
// based on, so a stale tab (say, your phone) can't silently overwrite newer changes from your PC.
import seed from '../data/seed.json';

const INIT = `CREATE TABLE IF NOT EXISTS planner (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

async function ensure(db: D1Database) {
  await db.prepare(INIT).run();
  await db
    .prepare('INSERT OR IGNORE INTO planner (id, rev, data, updated_at) VALUES (1, 1, ?, ?)')
    .bind(JSON.stringify(seed), new Date().toISOString())
    .run();
}

const looksLikePlanner = (p: any) =>
  p && p.version === 1 && Array.isArray(p.videos) && Array.isArray(p.releases) && p.settings && Array.isArray(p.settings.cadence);

/** The current planner document (for features that need the channel's context). */
export async function readPlanner(db: D1Database): Promise<any> {
  await ensure(db);
  const row = await db.prepare('SELECT data FROM planner WHERE id = 1').first<{ data: string }>();
  return JSON.parse(row!.data);
}

export async function getPlanner(db: D1Database): Promise<Response> {
  await ensure(db);
  const row = await db.prepare('SELECT rev, data FROM planner WHERE id = 1').first<{ rev: number; data: string }>();
  return new Response(`{"rev":${row!.rev},"planner":${row!.data}}`, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function putPlanner(db: D1Database, request: Request): Promise<Response> {
  let body: { planner?: unknown; baseRev?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Not JSON.' }, { status: 400 });
  }
  if (!looksLikePlanner(body.planner) || typeof body.baseRev !== 'number') {
    return Response.json({ error: 'Not a planner document.' }, { status: 400 });
  }
  await ensure(db);
  const result = await db
    .prepare('UPDATE planner SET data = ?, rev = rev + 1, updated_at = ? WHERE id = 1 AND rev = ?')
    .bind(JSON.stringify(body.planner), new Date().toISOString(), body.baseRev)
    .run();
  if (result.meta.changes === 0) {
    const row = await db.prepare('SELECT rev FROM planner WHERE id = 1').first<{ rev: number }>();
    return Response.json({ error: 'Changed somewhere else.', rev: row?.rev }, { status: 409 });
  }
  return Response.json({ rev: body.baseRev + 1 });
}
