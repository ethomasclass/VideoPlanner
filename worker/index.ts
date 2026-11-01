// The Cloudflare Worker: /api/* is handled here (after checking your sign-in);
// everything else is the app itself, served from the built files in dist/.
import { checkAccess, type AccessEnv } from './access';
import { getPlanner, putPlanner, readPlanner } from './planner';
import { brainstorm, thumbnailConcepts } from './brainstorm';
import { AIError, providerOf, type AIEnv } from './ai';
import { deleteImage, getImage, postImage } from './images';
import { getYouTube, performanceSummary, syncYouTube, type YouTubeEnv } from './youtube';
import { disconnect, finishSignIn, getAnalytics, startSignIn, syncAnalytics, type AnalyticsEnv } from './analytics';

interface Env extends AccessEnv, AIEnv, YouTubeEnv, AnalyticsEnv {
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
    if (url.pathname === '/api/ai' && request.method === 'GET') return Response.json({ provider: providerOf(env) });
    if (request.method === 'POST' && (url.pathname === '/api/brainstorm' || url.pathname === '/api/thumbnails')) {
      try {
        const body = (await request.json().catch(() => ({}))) as Record<string, any>;
        if (url.pathname === '/api/brainstorm') {
          return Response.json({ ideas: await brainstorm(env, await readPlanner(env.DB), body, await performanceSummary(env)) });
        }
        if (!body.concept) return Response.json({ error: 'No idea given.' }, { status: 400 });
        return Response.json({ concepts: await thumbnailConcepts(env, body) });
      } catch (e) {
        if (e instanceof AIError) return Response.json({ error: e.message, setup: e.setup }, { status: e.status });
        throw e;
      }
    }

    const youtubeData = async () => ({ ...(await getYouTube(env)), analytics: await getAnalytics(env) });
    if (url.pathname === '/api/youtube' && request.method === 'GET') return Response.json(await youtubeData());
    if (url.pathname === '/api/youtube/sync' && request.method === 'POST') {
      await syncYouTube(env);
      await syncAnalytics(env, 'manual');
      return Response.json(await youtubeData());
    }
    // YouTube Analytics sign-in (full-page visits, not fetches).
    if (url.pathname === '/api/youtube/oauth/start' && request.method === 'GET') return startSignIn(env, url.origin);
    if (url.pathname === '/api/youtube/oauth/callback' && request.method === 'GET') return finishSignIn(env, url);
    if (url.pathname === '/api/youtube/disconnect' && request.method === 'POST') {
      await disconnect(env);
      return Response.json(await youtubeData());
    }

    if (url.pathname === '/api/images' && request.method === 'POST') return postImage(env.DB, request);
    const img = url.pathname.match(/^\/api\/images\/([0-9a-f-]{36})$/);
    if (img) {
      if (request.method === 'GET') return getImage(env.DB, img[1]);
      if (request.method === 'DELETE') return deleteImage(env.DB, img[1]);
    }
    return Response.json({ error: 'Not found.' }, { status: 404 });
  },

  // Hourly (see [triggers] in wrangler.toml): refresh YouTube stats.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(syncYouTube(env, true).then(() => syncAnalytics(env)));
  },
} satisfies ExportedHandler<Env>;
