import { checkAccess, type AccessEnv } from '../_lib/access';

// Every /api request must come from your Cloudflare Access sign-in.
export const onRequest: PagesFunction<AccessEnv> = async (ctx) => {
  const result = await checkAccess(ctx.request, ctx.env);
  if (!result.ok) {
    return Response.json({ error: result.error, setup: result.setup ?? false }, { status: result.status });
  }
  return ctx.next();
};
