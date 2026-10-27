import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getVercelOidcToken } from '@vercel/oidc';

export const config = { runtime: 'nodejs', maxDuration: 30 };

export default {
  async fetch() {
    const candidates = [join(process.cwd(), 'intelligence.js'), join(process.cwd(), 'viabilidade', 'intelligence.js'), '/var/task/viabilidade/intelligence.js'];
    let source = null;
    let selected = null;
    for (const path of candidates) {
      try { source = await readFile(path, 'utf8'); selected = path; break; } catch {}
    }
    if (source === null) return Response.json({ ok: false, stage: 'source_not_found' }, { status: 500 });
    try { new Function(source); } catch (error) { return Response.json({ ok: false, stage: 'client_syntax', error: error.message }, { status: 500 }); }

    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || await getVercelOidcToken();
    if (!token) return Response.json({ ok: false, stage: 'gateway_auth', error: 'token_missing' }, { status: 500 });
    const response = await fetch('https://ai-gateway.vercel.sh/v1/models?include_availability', { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) return Response.json({ ok: false, stage: 'catalog', status: response.status, payload }, { status: 500 });
    const eligible = (payload.data || [])
      .filter(model => model.type === 'language' && model.model_eligibility?.status === 'eligible')
      .map(model => ({ id: model.id, name: model.name, tags: model.tags || [], pricing: model.pricing || null, context_window: model.context_window, max_tokens: model.max_tokens }))
      .sort((a, b) => Number(Boolean(b.tags.includes('reasoning'))) - Number(Boolean(a.tags.includes('reasoning'))) || Number(a.pricing?.output || 999) - Number(b.pricing?.output || 999));
    return Response.json({ ok: true, client: { bytes: source.length, path: selected }, request_context_availability: payload.request_context_availability, availability_status: payload.availability_status, eligibleCount: eligible.length, eligible: eligible.slice(0, 80) }, { headers: { 'Cache-Control': 'no-store' } });
  },
};
