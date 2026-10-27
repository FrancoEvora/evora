const PROJECT_REF = 'qsdffayasuzsmngteika';
const FALLBACK_URL = `https://${PROJECT_REF}.supabase.co`;

export const config = {
  runtime: 'nodejs',
};

export default {
  fetch(request) {
    const headers = {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
    };

    if (request.method !== 'GET') {
      headers.Allow = 'GET';
      return new Response(
        JSON.stringify({ configured: false, error: 'method_not_allowed' }),
        { status: 405, headers },
      );
    }

    const url = String(process.env.SUPABASE_URL || FALLBACK_URL).replace(/\/$/, '');
    const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
    const configured = Boolean(url && publishableKey);

    return new Response(
      JSON.stringify({
        configured,
        url,
        publishableKey: configured ? publishableKey : null,
        projectRef: PROJECT_REF,
        status: configured ? 'ready' : 'awaiting_supabase_activation',
        message: configured
          ? 'Supabase ready.'
          : 'The Supabase project must be restored and SUPABASE_PUBLISHABLE_KEY configured in Vercel.',
      }),
      { status: configured ? 200 : 503, headers },
    );
  },
};
