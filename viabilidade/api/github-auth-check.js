export const config = { runtime: 'nodejs' };

export default {
  async fetch(request) {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
    if (!supabaseUrl || !publishableKey) {
      return Response.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 });
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
      ok: response.status >= 300 && response.status < 400 && Boolean(location),
      status: response.status,
      locationHost: location ? new URL(location).host : null,
      body: body.slice(0, 500),
      redirectTo,
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  },
};
