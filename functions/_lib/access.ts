// Checks that a request came through Cloudflare Access (your Google sign-in) by verifying the
// signed token Access attaches to every request. Without this, anyone who found the URL of the
// API could read or change your plans if Access were ever switched off.

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string; // e.g. "chunkhistory.cloudflareaccess.com"
  ACCESS_AUD?: string; // the Application Audience (AUD) tag of the Access application
  ALLOWED_EMAILS?: string; // optional, comma-separated; the Access policy already limits who gets in
  DEV_NO_AUTH?: string; // "1" skips the check, but only on localhost
}

export type AccessResult = { ok: true; email: string } | { ok: false; status: number; error: string; setup?: boolean };

interface Jwk extends JsonWebKey {
  kid: string;
}
let certs: { keys: Jwk[]; fetchedAt: number; domain: string } | null = null;

const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const b64urlToJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(domain: string, force = false): Promise<Jwk[]> {
  if (!force && certs && certs.domain === domain && Date.now() - certs.fetchedAt < 3600_000) return certs.keys;
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Could not fetch Access certs (${res.status})`);
  const body = (await res.json()) as { keys: Jwk[] };
  certs = { keys: body.keys, fetchedAt: Date.now(), domain };
  return body.keys;
}

function tokenFrom(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  return cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] ?? null;
}

export async function checkAccess(request: Request, env: AccessEnv): Promise<AccessResult> {
  const host = new URL(request.url).hostname;
  if (env.DEV_NO_AUTH === '1' && (host === 'localhost' || host === '127.0.0.1')) {
    return { ok: true, email: 'local-dev' };
  }
  const domain = env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!domain || !env.ACCESS_AUD) {
    return { ok: false, status: 503, setup: true, error: 'The planner is locked until Cloudflare Access is set up (README, step 4).' };
  }

  const token = tokenFrom(request);
  if (!token) return { ok: false, status: 401, error: 'Not signed in.' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, error: 'Malformed sign-in token.' };

  try {
    const header = b64urlToJson(parts[0]) as { kid?: string; alg?: string };
    if (header.alg !== 'RS256') return { ok: false, status: 401, error: 'Unexpected token algorithm.' };
    let jwk = (await getKeys(domain)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await getKeys(domain, true)).find((k) => k.kid === header.kid); // keys rotate
    if (!jwk) return { ok: false, status: 401, error: 'Unknown signing key.' };

    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return { ok: false, status: 401, error: 'Bad signature.' };

    const claims = b64urlToJson(parts[1]) as { aud?: string | string[]; exp?: number; iss?: string; email?: string };
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(env.ACCESS_AUD)) return { ok: false, status: 401, error: 'Token is for a different app.' };
    if (!claims.exp || claims.exp * 1000 < Date.now()) return { ok: false, status: 401, error: 'Sign-in expired.' };
    if (claims.iss !== `https://${domain}`) return { ok: false, status: 401, error: 'Token from the wrong team.' };

    const email = (claims.email ?? '').toLowerCase();
    const allowed = env.ALLOWED_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (allowed?.length && !allowed.includes(email)) return { ok: false, status: 403, error: 'This account is not allowed.' };
    return { ok: true, email };
  } catch (e) {
    return { ok: false, status: 401, error: `Could not verify sign-in: ${e}` };
  }
}
