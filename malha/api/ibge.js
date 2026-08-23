export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  const url = 'https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3170206?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'MALHA/8.0' } });
    if (!r.ok) throw new Error(`IBGE ${r.status}`);
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'IBGE indisponível', detail: String(e?.message || e) });
  } finally {
    clearTimeout(timer);
  }
}
