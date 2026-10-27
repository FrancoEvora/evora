import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getVercelOidcToken } from '@vercel/oidc';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  return (payload?.output || []).flatMap(item => item?.content || []).map(item => item?.text || '').join('\n').trim();
}

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
    const model = process.env.AI_GATEWAY_MODEL || 'openai/gpt-5-mini';
    const response = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: 'Responda apenas com a palavra OK.', max_output_tokens: 64, store: false }),
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }
    if (!response.ok) return Response.json({ ok: false, stage: 'gateway_model', status: response.status, payload }, { status: 500 });
    return Response.json({ ok: true, client: { bytes: source.length, path: selected }, gateway: { model: payload.model || model, responseId: payload.id || null, output: outputText(payload), usage: payload.usage || null } }, { headers: { 'Cache-Control': 'no-store' } });
  },
};
