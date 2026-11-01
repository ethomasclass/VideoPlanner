// The Cloudflare Worker: /api/* is handled here (after checking your sign-in);
// everything else is the app itself, served from the built files in dist/.
import { checkAccess, type AccessEnv } from './access';
import { getPlanner, putPlanner, readPlanner } from './planner';
import { brainstorm, thumbnailConcepts } from './brainstorm';
import { ClaudeError } from './claude';
import { deleteImage, getImage, postImage } from './images';

interface Env extends AccessEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string; // a Worker secret
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const access = await checkAccess(request, env);
    if (!access.ok) {
      return Response.json({ error: access.error, setup: access.setup ?? false }, { status: access.status });
    }

    if (url.pathname === '/api/planner') {
      if (request.method === 'GET') return getPlanner(env.DB);
      if (request.method === 'PUT') return putPlanner(env.DB, request);
      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    }
    if (request.method === 'POST' && (url.pathname === '/api/brainstorm' || url.pathname === '/api/thumbnails')) {
      try {
        const body = (await request.json().catch(() => ({}))) as Record<string, any>;
        if (url.pathname === '/api/brainstorm') {
          return Response.json({ ideas: await brainstorm(env.ANTHROPIC_API_KEY, await readPlanner(env.DB), body) });
        }
        if (!body.concept) return Response.json({ error: 'No idea given.' }, { status: 400 });
        return Response.json({ concepts: await thumbnailConcepts(env.ANTHROPIC_API_KEY, body) });
      } catch (e) {
        if (e instanceof ClaudeError) return Response.json({ error: e.message, setup: e.setup }, { status: e.status });
        throw e;
      }
    }

    if (url.pathname === '/api/images' && request.method === 'POST') return postImage(env.DB, request);
    const img = url.pathname.match(/^\/api\/images\/([0-9a-f-]{36})$/);
    if (img) {
      if (request.method === 'GET') return getImage(env.DB, img[1]);
      if (request.method === 'DELETE') return deleteImage(env.DB, img[1]);
    }
    return Response.json({ error: 'Not found.' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
