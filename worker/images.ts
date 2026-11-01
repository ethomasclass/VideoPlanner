// Thumbnail images, stored in the same D1 database as the planner (one row per image, base64 text,
// decoded with the runtime's native base64 so serving an image costs almost no CPU).
const MAX_BYTES = 1_400_000; // ~1.9 MB as base64, under D1's 2 MB row limit
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const INIT = `CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
)`;

type B64Array = Uint8Array & { toBase64(): string };
const fromBase64 = (s: string) => (Uint8Array as unknown as { fromBase64(s: string): Uint8Array }).fromBase64(s);

export async function postImage(db: D1Database, request: Request): Promise<Response> {
  const mime = (request.headers.get('Content-Type') ?? '').split(';')[0].trim();
  if (!TYPES.has(mime)) return Response.json({ error: 'Only JPEG, PNG or WebP images.' }, { status: 415 });
  const buf = new Uint8Array(await request.arrayBuffer()) as B64Array;
  if (buf.byteLength === 0) return Response.json({ error: 'Empty image.' }, { status: 400 });
  if (buf.byteLength > MAX_BYTES) return Response.json({ error: 'Image too large (max 1.4 MB after resizing).' }, { status: 413 });
  await db.prepare(INIT).run();
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO images (id, mime, data, bytes, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, mime, buf.toBase64(), buf.byteLength, new Date().toISOString())
    .run();
  return Response.json({ id });
}

export async function getImage(db: D1Database, id: string): Promise<Response> {
  await db.prepare(INIT).run();
  const row = await db.prepare('SELECT mime, data FROM images WHERE id = ?').bind(id).first<{ mime: string; data: string }>();
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(fromBase64(row.data), {
    // Image ids never change content, so the browser can keep them. "private": only this signed-in browser.
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}

export async function deleteImage(db: D1Database, id: string): Promise<Response> {
  await db.prepare(INIT).run();
  await db.prepare('DELETE FROM images WHERE id = ?').bind(id).run();
  return Response.json({ ok: true });
}
