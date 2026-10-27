export const config = { runtime: 'nodejs' };

const PROJECT_REF = 'qsdffayasuzsmngteika';
const CALLBACK_URL = `https://${PROJECT_REF}.supabase.co/auth/v1/callback`;
const HOMEPAGE_URL = 'https://evora-viabilidade.vercel.app';
const REDIRECT_PATTERN = 'https://evora-viabilidade.vercel.app/**';

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

async function inspectProvider(supabaseUrl, publishableKey, returnTo) {
  const authorizeUrl = new URL('/auth/v1/authorize', supabaseUrl);
  authorizeUrl.searchParams.set('provider', 'github');
  authorizeUrl.searchParams.set('redirect_to', returnTo.toString());
  try {
    const response = await fetch(authorizeUrl, {
      redirect: 'manual',
      headers: {
        apikey: publishableKey,
        Accept: 'application/json',
      },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      return { enabled: true, location };
    }
    const body = await response.text();
    return { enabled: false, failure: describeFailure(response.status, body), status: response.status };
  } catch {
    return {
      enabled: false,
      failure: {
        code: 'github_oauth_unreachable',
        description: 'Não foi possível alcançar o serviço de autenticação.',
      },
      status: 503,
    };
  }
}

function readiness(provider) {
  return {
    enabled: provider.enabled,
    code: provider.enabled ? null : provider.failure?.code || 'github_oauth_unavailable',
    description: provider.enabled ? 'GitHub OAuth disponível.' : provider.failure?.description || 'GitHub OAuth indisponível.',
    setup: {
      applicationName: 'Évora Viabilidade',
      homepageUrl: HOMEPAGE_URL,
      callbackUrl: CALLBACK_URL,
      redirectPattern: REDIRECT_PATTERN,
      githubOAuthAppsUrl: 'https://github.com/settings/developers',
      supabaseProvidersUrl: `https://supabase.com/dashboard/project/${PROJECT_REF}/auth/providers`,
      supabaseUrlConfigUrl: `https://supabase.com/dashboard/project/${PROJECT_REF}/auth/url-configuration`,
    },
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
    const checkOnly = requestUrl.searchParams.get('check') === '1';

    if (!supabaseUrl || !publishableKey) {
      const state = {
        enabled: false,
        code: 'supabase_not_configured',
        description: 'A conexão com o Supabase não está configurada.',
        setup: {
          applicationName: 'Évora Viabilidade',
          homepageUrl: HOMEPAGE_URL,
          callbackUrl: CALLBACK_URL,
          redirectPattern: REDIRECT_PATTERN,
        },
      };
      if (checkOnly) return Response.json(state, { status: 200, headers: { 'Cache-Control': 'no-store' } });
      returnTo.searchParams.set('auth_error', state.code);
      returnTo.searchParams.set('auth_error_description', state.description);
      return redirect(returnTo.toString());
    }

    const provider = await inspectProvider(supabaseUrl, publishableKey, returnTo);
    if (checkOnly) {
      return Response.json(readiness(provider), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    if (provider.enabled && provider.location) {
      return redirect(provider.location);
    }

    const failure = provider.failure || describeFailure(provider.status || 503, '');
    returnTo.searchParams.set('auth_error', failure.code);
    returnTo.searchParams.set('auth_error_description', failure.description);
    return redirect(returnTo.toString());
  },
};
