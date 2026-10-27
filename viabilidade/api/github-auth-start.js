export const config = { runtime: 'nodejs' };

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function safeReturnTo(requestUrl, value) {
  const origin = new URL(requestUrl).origin;
  try {
    const candidate = new URL(String(value || ''), origin);
    if (candidate.origin !== origin) return new URL('/#intelligence', origin);
    candidate.hash = '';
    candidate.searchParams.set('auth_callback', 'github');
    return candidate;
  } catch {
    return new URL('/?auth_callback=github', origin);
  }
}

function describeFailure(status, body) {
  let message = body;
  try {
    const data = JSON.parse(body);
    message = data?.msg || data?.message || data?.error_description || data?.error || body;
  } catch {}
  const text = String(message || '').slice(0, 500);
  if (/provider.*not enabled|unsupported provider/i.test(text)) {
    return {
      code: 'github_provider_disabled',
      description: 'O provedor GitHub ainda não está habilitado no Supabase Auth do projeto evora-gestao.',
    };
  }
  if (/redirect/i.test(text)) {
    return {
      code: 'github_redirect_not_allowed',
      description: 'A URL de retorno da Évora Viabilidade ainda não foi autorizada no Supabase.',
    };
  }
  return {
    code: 'github_oauth_unavailable',
    description: `O login com GitHub não pôde ser iniciado (${status}). ${text}`.slice(0, 700),
  };
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET' } });
    }

    const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
    const requestUrl = new URL(request.url);
    const returnTo = safeReturnTo(request.url, requestUrl.searchParams.get('return_to'));

    if (!supabaseUrl || !publishableKey) {
      returnTo.searchParams.set('auth_error', 'supabase_not_configured');
      returnTo.searchParams.set('auth_error_description', 'A conexão com o Supabase não está configurada.');
      return redirect(returnTo.toString());
    }

    const authorizeUrl = new URL('/auth/v1/authorize', supabaseUrl);
    authorizeUrl.searchParams.set('provider', 'github');
    authorizeUrl.searchParams.set('redirect_to', returnTo.toString());

    let response;
    try {
      response = await fetch(authorizeUrl, {
        redirect: 'manual',
        headers: {
          apikey: publishableKey,
          Accept: 'application/json',
        },
      });
    } catch {
      returnTo.searchParams.set('auth_error', 'github_oauth_unreachable');
      returnTo.searchParams.set('auth_error_description', 'Não foi possível alcançar o serviço de autenticação.');
      return redirect(returnTo.toString());
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      return redirect(location);
    }

    const body = await response.text();
    const failure = describeFailure(response.status, body);
    returnTo.searchParams.set('auth_error', failure.code);
    returnTo.searchParams.set('auth_error_description', failure.description);
    return redirect(returnTo.toString());
  },
};
