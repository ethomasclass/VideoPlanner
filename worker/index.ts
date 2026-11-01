// The Cloudflare Worker: /api/* is handled here (after checking your sign-in);
// everything else is the app itself, served from the built files in dist/.
import { checkAccess, type AccessEnv } from './access';
import { getPlanner, putPlanner } from './planner';

interface Env extends AccessEnv {
  DB: D1Database;
  ASSETS: Fetcher;
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
    return Response.json({ error: 'Not found.' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
