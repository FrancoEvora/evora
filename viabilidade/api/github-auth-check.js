import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const config = { runtime: 'nodejs' };

export default {
  async fetch(request) {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
    let client = { ok: false };
    try {
      const path = join(process.cwd(), 'viabilidade', 'supabase-auth-github.js');
      const source = await readFile(path, 'utf8');
      new Function(source);
      client = { ok: true, bytes: source.length, path };
    } catch (error) {
      client = { ok: false, error: error.message, stack: error.stack };
    }
    if (!supabaseUrl || !publishableKey) {
      return Response.json({ ok: false, client, error: 'supabase_not_configured' }, { status: 503 });
    }
    const redirectTo = new URL('/?auth_callback=github', request.url).toString();
    const target = new URL('/auth/v1/authorize', supabaseUrl);
    target.searchParams.set('provider', 'github');
    target.searchParams.set('redirect_to', redirectTo);
    const response = await fetch(target, {
      redirect: 'manual',
      headers: { apikey: publishableKey, Accept: 'application/json' },
    });
    const body = await response.text();
    const location = response.headers.get('location');
    return Response.json({
      ok: client.ok,
      client,
      provider: {
        enabled: response.status >= 300 && response.status < 400 && Boolean(location),
        status: response.status,
        locationHost: location ? new URL(location).host : null,
        body: body.slice(0, 500),
        redirectTo,
      },
    }, { status: client.ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
  },
};
