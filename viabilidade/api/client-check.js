export const config = { runtime: 'nodejs' };

export default {
  async fetch(request) {
    const target = new URL('/intelligence.js', request.url);
    const response = await fetch(target);
    const source = await response.text();
    if (!response.ok) {
      return new Response(JSON.stringify({ ok: false, status: response.status }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    try {
      new Function(source);
      return new Response(JSON.stringify({ ok: true, bytes: source.length }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message, stack: error.stack }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
  },
};
