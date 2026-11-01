// The Cloudflare Worker: /api/* is handled here (after checking your sign-in);
// everything else is the app itself, served from the built files in dist/.
import { checkAccess, type AccessEnv } from './access';
import { getPlanner, putPlanner, readPlanner } from './planner';
import { brainstorm, BrainstormError } from './brainstorm';

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
    if (url.pathname === '/api/brainstorm' && request.method === 'POST') {
      try {
        const body = (await request.json().catch(() => ({}))) as Parameters<typeof brainstorm>[2];
        const ideas = await brainstorm(env.ANTHROPIC_API_KEY, await readPlanner(env.DB), body);
        return Response.json({ ideas });
      } catch (e) {
        if (e instanceof BrainstormError) return Response.json({ error: e.message, setup: e.setup }, { status: e.status });
        throw e;
      }
    }
    return Response.json({ error: 'Not found.' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
