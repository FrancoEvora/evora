export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  const url = 'https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3170206?formato=application%2Fvnd.geo%2Bjson&qualidade=minima';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/vnd.geo+json', 'User-Agent': 'MALHA/8.1' }
    });
    if (!r.ok) throw new Error(`IBGE ${r.status}`);
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'IBGE indisponível', detail: String(e?.message || e) });
  } finally {
    clearTimeout(timer);
  }
}
