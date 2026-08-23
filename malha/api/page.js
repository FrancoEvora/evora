const INDEX_URL = 'https://cdn.jsdelivr.net/gh/FrancoEvora/evora@386a876c5f4c462b25e99a339102c7ad05eeed83/malha/index.html';

export default async function handler(req, res) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(INDEX_URL, { signal: controller.signal, headers: { 'User-Agent': 'MALHA/8.1' } });
    if (!r.ok) throw new Error(`frontend ${r.status}`);
    const html = await r.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(html);
  } catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(502).send('<!doctype html><meta charset="utf-8"><title>MALHA</title><h1>MALHA temporariamente indisponível</h1>');
  } finally {
    clearTimeout(timer);
  }
}
