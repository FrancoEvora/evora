const PROJECT_REF = 'qsdffayasuzsmngteika';
const FALLBACK_URL = `https://${PROJECT_REF}.supabase.co`;

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ configured: false, error: 'method_not_allowed' });
  }

  const url = String(process.env.SUPABASE_URL || FALLBACK_URL).replace(/\/$/, '');
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
  const configured = Boolean(url && publishableKey);

  return res.status(configured ? 200 : 503).json({
    configured,
    url,
    publishableKey: configured ? publishableKey : null,
    projectRef: PROJECT_REF,
    status: configured ? 'ready' : 'awaiting_supabase_activation',
    message: configured
      ? 'Supabase ready.'
      : 'The Supabase project must be restored and SUPABASE_PUBLISHABLE_KEY configured in Vercel.',
  });
};
